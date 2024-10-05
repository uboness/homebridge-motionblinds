import * as crypto from 'crypto';
import * as dgram from 'dgram';
import { EventEmitter } from 'events';
import { clearTimeout } from 'timers';
import { Availability } from '../../Availability.js';
import { Detachable, isError, isNumber, isString, JSONValue } from '../../common.js';
import { ILogger, NullLogger } from '../../Logger.js';
import { API } from './api.js';
import { MessageIdGenerator } from './MessageIDGenerator.js';
import GetDeviceListReq = API.GetDeviceListReq;
import GetDeviceListResp = API.GetDeviceListResp;
import isHeartbeat = API.isHeartbeat;
import isReport = API.isReport;
import WriteDeviceReq = API.WriteDeviceReq;
import WriteDeviceResp = API.WriteDeviceResp;

export const MULTICAST_IP = '238.0.0.18'
export const UDP_PORT_SEND = 32100
export const UDP_PORT_RECEIVE = 32101
export const DEFAULT_TIMEOUT = 3000;

const RETRY_MS = [400, 800, 1200, 1600]
const MAX_RETRIES = 4

type ResponseCallback = (respOrError: API.Response | Error) => void

export class MotionClient {

    static readonly API = API;

    private readonly config: MotionClient.Config;
    private timeoutMillis: number

    private mac?: string;
    private token?: string;
    private sendSocket?: dgram.Socket
    private recvSocket?: dgram.Socket

    private readonly logger: ILogger;
    private readonly emitter: EventEmitter;
    private readonly callbacks = new Map<string, ResponseCallback>()

    readonly availability: Availability;
    readonly msgIdGenerator = new MessageIdGenerator();
    private knownDevices = new Set<string>();

    private heartbeatMonitorTimeout: any;
    private lastHeartbeatTimestamp?: number;

    constructor(config: MotionClient.Config) {
        this.config = config;
        this.timeoutMillis = config.timeout ?? DEFAULT_TIMEOUT;
        this.emitter = new EventEmitter();
        this.logger = config.logger?.getLogger('client') ?? NullLogger;
        this.availability = new Availability(false);
    }

    async start() {
        await this.connect();
        this.emitter.on('error', error => {
            this.reconnect(`connection error (${error})`);
        });
        this.emitter.on('heartbeat', () => {
            this.resetHeartbeat();
        });
        const { mac, token, ProtocolVersion, data } = await this.listDevices();
        if (ProtocolVersion !== API.VERSION) {
            throw new Error(`This plugin is API incompatible with the configured MOTION Bridge [${this.config.name || this.config.ip}]`);
        }
        this.mac = mac;
        this.token = token;
        data.forEach(d => this.knownDevices.add(`${d.deviceType}:${d.mac}`));
        this.availability.setAvailable(true);
        this.resetHeartbeat();
    }

    async close() {
        try {
            await this.disconnect();
        } catch (error) {
            this.logger.error(`Failed to cleanly disconnect`, error);
        }
        this.availability.close();
        this.emitter.emit('close');
        this.emitter.removeAllListeners();
    }

    private async connect() {

        this.sendSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

        this.sendSocket.on('error', error => {
            if (this.callbacks.size) {
                this.callbacks.forEach((callback, _) => callback(error))
            }
            this.emitter.emit('error', error);
        });

        this.sendSocket.on('close', () => {
            if (this.callbacks.size) {
                this.callbacks.forEach((callback, _) => callback(new Error('disconnected')))
            }
        });

        this.sendSocket.on('message', (payload, rinfo) => {
            this.resetHeartbeat();
            const resp = parseJSON<API.Response>(payload);
            if (!resp || !isString(resp.msgType)) {
                this.emitter.emit('error', new Error(`Failed to JSON parse ${payload.byteLength} byte message`))
                return
            }

            if (API.isGetDeviceListResp(resp) && isString(resp.token)) {
                this.token = resp.token
            }

            const handle = requestHandle(resp.msgType, API.isGetDeviceListResp(resp) ? undefined : resp.mac);
            this.callbacks.get(handle)?.(resp)
        });

        const recvSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

        recvSocket.on('error', error => {
            this.emitter.emit('error', error);
        })

        recvSocket.on('message', (payload, rinfo) => {
            this.resetHeartbeat();
            const notification = parseJSON<API.Notification>(payload);
            if (!notification || !isString(notification.msgType)) {
                this.emitter.emit('error', new Error(`Failed to JSON parse ${payload.byteLength} byte message`))
                return
            }

            this.availability.setAvailable(true);

            if (isHeartbeat(notification)) {
                this.token = notification.token;
                this.emitter.emit('heartbeat', notification, rinfo);
                const prevHeartbeatTimestamp = this.lastHeartbeatTimestamp;
                this.lastHeartbeatTimestamp = Date.now();
                if (!prevHeartbeatTimestamp) {
                    this.logger.debug(`heartbeat received`);
                } else {
                    const afterSec = Math.trunc((this.lastHeartbeatTimestamp - prevHeartbeatTimestamp) / 1000);
                    this.logger.debug(`heartbeat received (after ${afterSec} sec)`);
                }
            } else if (isReport(notification)) {
                this.emitter.emit('report', notification, rinfo);
            } else {
                this.logger.warn(`Unknown notification [${JSON.stringify(notification, undefined, 2)}]`);
            }
        })

        recvSocket.bind(UDP_PORT_RECEIVE, MULTICAST_IP);
        this.recvSocket = recvSocket;

        return new Promise<void>((resolve, reject) => {
            recvSocket.on('listening', async () => {
                try {
                    if (this.config.multicastInterface) {
                        recvSocket.setMulticastInterface(this.config.multicastInterface);
                    }
                    recvSocket.addMembership(MULTICAST_IP, this.config.multicastInterface);
                    recvSocket.setBroadcast(true);
                    recvSocket.setMulticastTTL(128);
                    resolve();
                } catch (err) {
                    this.emitter.emit('error', err)
                    await this.disconnect(`${err}`);
                    reject(err);
                }
            })
        });
    }

    private async disconnect(reason?: string): Promise<void> {
        this.availability.setAvailable(false, reason);
        clearTimeout(this.heartbeatMonitorTimeout);
        await Promise.all([
            this.recvSocket?.close(),
            this.sendSocket?.close()
        ]);
    }

    private async reconnect(reason?: string, attempt: number = 0): Promise<void> {
        this.logger.info(`Reconnecting. reason: ${reason}, attempt [${attempt + 1}]`);
        await this.disconnect('repairing connection');
        try {
            await this.connect();
            await this.ping();
            this.availability.setAvailable(true);
            this.resetHeartbeat();
            this.logger.info(`Successfully reconnected`);
        } catch (error) {
            setTimeout(() => {
                this.reconnect(reason, attempt++)
            }, 3000);
        }
    }

    private async ping() {
        const devices = await this.listDevices();
        if (!devices) {
            throw new Error(`ping failed`);
        }
    }

    private async checkHeartbeat() {
        try {
            await this.ping();
            this.availability.setAvailable(true);
            this.logger.debug('proactive heartbeat [success]');
        } catch (error) {
            this.availability.setAvailable(false, `${error}`);
            this.logger.debug(`proactive heartbeat [fail] ${error}`);
        } finally {
            this.resetHeartbeat();
        }
    }

    private resetHeartbeat() {
        clearTimeout(this.heartbeatMonitorTimeout);
        // the bridge should be sending a heartbeat every 30~60 seconds, so we'll schedule our heartbeat check
        // to 65 sec. ie. we'll only ping the bridge if we didn't hear anything from it for 65 seconds.
        this.heartbeatMonitorTimeout = setTimeout(() => this.checkHeartbeat(), 65 * 1000);
    }

    on(event: 'availability', handler: Availability.Handler): Detachable;
    on(event: 'heartbeat', handler: (heartbeat: API.Heartbeat) => void): Detachable;
    on(event: 'error', handler: (err: Error) => void): Detachable;
    on(event: 'report', handler: (device: API.MotionDevice) => void): Detachable;
    on(event: 'availability' | 'heartbeat' | 'report' | 'error', handler: (...args: any[]) => void): Detachable {
        if (event === 'availability') {
            return this.availability.on('change', handler);
        }
        this.emitter.on(event, handler);
        return {
            detach: () => this.emitter.off(event, handler)
        };
    }

    requestUpdate(mac: string, deviceType: API.DeviceType) {
        if (!this.token) {
            return Promise.reject(`missing token or accessToken (call getDeviceList)`)
        }
        this.sendReceive<API.WriteDeviceReq, undefined>({
            msgID: this.msgIdGenerator.next(),
            msgType: 'WriteDevice',
            mac,
            deviceType,
            data: { operation: 5 },
            AccessToken: this.accessToken(this.config.key, this.token),
        }).then();
    }

    async getDevice(mac: string, deviceType: API.DeviceType): Promise<API.MotionDevice | undefined> {
        const handle = requestHandle('ReadDeviceAck', mac);
        return this.sendReceive<API.ReadDeviceReq, API.ReadDeviceResp | undefined>({
            msgType: 'ReadDevice',
            msgID: this.msgIdGenerator.next(),
            mac,
            deviceType
        }, handle);
    }

    async updateDevice(mac: string, deviceType: API.DeviceType, data: API.DeviceUpdate): Promise<API.MotionDevice> {
        if (isNumber(data.targetPosition) && (data.targetPosition < 0 || data.targetPosition > 100)) {
            return Promise.reject(`Invalid targetPosition ${data.targetPosition}`);
        }
        if (isNumber(data.operation) && (data.operation < 0 || data.operation > 5)) {
            return Promise.reject(`Invalid operation ${data.operation}`);
        }

        if (!this.config.key) {
            return Promise.reject(`missing key or accessToken`);
        }
        if (!this.token) {
            return Promise.reject(`missing token or accessToken (call getDeviceList)`)
        }
        const handle = requestHandle('WriteDeviceAck', mac);
        return this.sendReceive<WriteDeviceReq, WriteDeviceResp>({
            msgID: this.msgIdGenerator.next(),
            msgType: 'WriteDevice',
            mac,
            deviceType,
            data,
            AccessToken: this.accessToken(this.config.key, this.token),
        }, handle);
    }

    async getAllDevices(): Promise<API.MotionDevice[]> {
        const devicesList = await this.listDevices()
        const devices = await Promise.all(
            devicesList.data
                .filter(d => !!d && d.deviceType !== API.DEVICE_TYPE_BRIDGE)
                .map(d => this.getDevice(d.mac, d.deviceType)!)
        );
        return devices.filter(d => d !== undefined) as API.MotionDevice[];
    }

    private listDevices(): Promise<GetDeviceListResp> {
        const handle = requestHandle('GetDeviceListAck');
        return this.sendReceive<GetDeviceListReq, GetDeviceListResp>({
            msgID: this.msgIdGenerator.next(),
            msgType: 'GetDeviceList'
        }, handle);
    }

    private accessToken(key: string, token: string) {
        const cipher = crypto.createCipheriv('aes-128-ecb', key, null)
        cipher.setAutoPadding(false)
        return (
            cipher
                .update(token)
                .toString('hex')
                .toUpperCase() +
            cipher
                .final()
                .toString('hex')
                .toUpperCase()
        )
    }

    private sendReceive<Req extends API.Request, Resp extends (API.Response | undefined)>(req: Req, waitHandle?: string, retry = 0): Promise<Resp> {
        req.msgID = this.msgIdGenerator.next();
        const payload = JSON.stringify(req)
        return new Promise<Resp>((resolve, reject) => {
            if (!this.sendSocket) {
                return reject(new Error(`not connected`))
            }

            //todo not sure about the reason for the randomness here
            const timeoutMs = RETRY_MS[retry] ?? RETRY_MS[RETRY_MS.length - 1] + Math.trunc(Math.random() * 100);

            let timer: any;
            if (waitHandle) {

                timer = setTimeout(() => {
                    if (retry < MAX_RETRIES) {
                        this.sendReceive<Req, Resp>(req, waitHandle, retry + 1).then(resolve, reject)
                    } else {
                        this.callbacks.delete(waitHandle)
                        reject(new Error(`timed out after ${timeoutMs}ms`))
                    }
                }, timeoutMs);

                this.callbacks.set(waitHandle, (resp) => {
                    clearTimeout(timer);
                    this.callbacks.delete(waitHandle);
                    if (isError(resp)) {
                        return reject(resp);
                    }
                    if (!!resp.data) {
                        return resolve(resp as Resp);
                    }
                    if (resp.actionResult === 'device not exist') {
                        return resolve(undefined as Resp);
                    }
                    if (!!resp.actionResult) {
                        return reject(new Error(resp.actionResult));
                    }
                    return reject(new Error(`Failed to execute [${req.msgType}]`));
                })

            }

            this.sendSocket.send(payload, UDP_PORT_SEND, this.config.ip, (err, _) => {
                if (err) {
                    if (waitHandle) {
                        clearTimeout(timer)
                        this.callbacks.delete(waitHandle)
                    }
                    reject(err)
                }
            })
        })
    }
}

export namespace MotionClient {

    export type Config = {
        key: string,
        ip: string,
        name?: string,
        multicastInterface?: string,
        timeout?: number,
        logger?: ILogger
    }

}

const requestHandle = (msgType: API.Response['msgType'], mac?: string): string => {
    return mac ? `${msgType}:${mac}` : msgType;
}

function parseJSON<T extends JSONValue>(buffer: Buffer): T | undefined {
    try {
        return JSON.parse(buffer.toString('utf8'))
    } catch (err) {
        return undefined
    }
}