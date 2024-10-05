import EventEmitter from 'events';
import { clearTimeout } from 'timers';
import { Availability } from '../Availability.js';
import { bound, Detachable, isNil, isUndefined } from '../common.js';
import { ILogger } from '../Logger.js';
import { API, MotionClient } from './motion/index.js';

export class MotionBridge {

    static readonly DEFAULT_OPEN_CLOSE_TIME= 60; //seconds
    static readonly DEFAULT_POLL_INTERVAL= 60;   //seconds

    static async create(config: MotionBridge.Config, logger: ILogger): Promise<MotionBridge> {
        if (isNil(config.id)) {
            throw new Error('Invalid bridge configuration. Missing [id] setting');
        }
        if (isNil(config.ip)) {
            throw new Error('Invalid bridge configuration. Missing [ip] setting');
        }
        if (isNil(config.key)) {
            throw new Error('Invalid bridge configuration. Missing [key] setting (you can find the bridge key by tapping a few times on the About page in the MotionBlinds app');
        }
        const client  = new MotionClient({
            key: config.key,
            ip: config.ip,
            name: config.name
        });

        return new MotionBridge(config, client, logger);
    }

    readonly config: MotionBridge.Config;
    private readonly client: MotionClient;
    private readonly logger: ILogger;

    private readonly emitter = new EventEmitter();

    private pollingTimeout: any;
    private readonly pollInterval: number;

    constructor(config: MotionBridge.Config, client: MotionClient, logger: ILogger) {
        this.config = config;
        this.client = client;
        this.client.on('error', error => {
            this.logger.error(`Bridge encountered an error. ${error}`);
        });
        this.client.on('report', (device) => {
            const update = toUpdate(device);
            this.emitter.emit('deviceUpdate', update, MotionBridge.UpdateType.Report);
        });
        this.pollInterval = bound(config.pollInterval ?? MotionBridge.DEFAULT_POLL_INTERVAL, 30, Number.MAX_VALUE) * 1000;
        this.logger = logger.getLogger('bridge', config.name ?? config.ip);
    }

    get id() {
        return this.config.id;
    }

    get ip() {
        return this.config.ip;
    }

    get name() {
        return this.config.name;
    }

    get available() {
        return this.client.availability.available;
    }

    get availability() {
        return this.client.availability;
    }

    async start() {
        await this.client.start();
        this.pollDevices().then()
        this.logger.debug(`Bridge client started [${this.config.ip}], name [${this.config.name}]`);
    }

    async close() {
        this.logger.info(`closing...`);
        this.stopPolling();
        await this.client.close();
        this.emitter.removeAllListeners();
    }

    async listDevices(): Promise<MotionBridge.Device[]> {
        return (await this.client.getAllDevices())
            // at the moment we only support roller blinds
            .filter(apiDevice => apiDevice.data.type === API.BlindType.RollerBlind)
            .map(apiDevice => toDevice(apiDevice, this.config));
    }

    async getDevice(id: string): Promise<MotionBridge.Device | undefined> {
        // the id is the mac address
        const apiDevice = await this.client.getDevice(id, API.DEVICE_TYPE_BLIND);
        if (isUndefined(apiDevice)) {
            return;
        }

        // at this point we only support roller blinds
        if (apiDevice.data.type === API.BlindType.RollerBlind) {
            return toDevice(apiDevice, this.config);
        }
    }

    async identifyDevice(id: string): Promise<void> {
        // at this point MOTION API doesn't support identifying devices.
    }

    async updateDevice(id: string, state: MotionBridge.Device.WriteState): Promise<void> {
        await this.client.updateDevice(id, API.DEVICE_TYPE_BLIND, toDeviceUpdate(state));
    }

    on(event: "availability", handler: Availability.Handler): Detachable ;
    on(event: "deviceUpdate", handler: MotionBridge.DeviceUpdateHandler): Detachable;
    on(event: "availability" | "deviceUpdate", handler: Availability.Handler | MotionBridge.DeviceUpdateHandler): Detachable {
        switch (event) {
            case 'availability':
                return this.client.availability.on('change', handler as Availability.Handler);
            default:
                this.emitter.on('deviceUpdate', handler as MotionBridge.DeviceUpdateHandler);
                return { detach: () => this.emitter.off('deviceUpdate', handler) };
        }
    }

    private async pollDevices() {
        this.logger.debug(`polling devices...`);
        const devices = await this.client.getAllDevices();
        clearTimeout(this.pollingTimeout);
        this.pollingTimeout = setTimeout(this.pollDevices.bind(this), this.pollInterval);
        for (const device of devices) {
            this.emitter.emit('deviceUpdate', toUpdate(device), MotionBridge.UpdateType.Poll);
        }
    }

    private stopPolling() {
        clearTimeout(this.pollingTimeout);
        this.pollingTimeout = undefined;
    }
}


export namespace MotionBridge {

    export type Config = {
        id: string,
        ip: string,
        key: string,
        name?: string,
        pollInterval?: number, //min 60 seconds
        deviceDefaults?: Partial<Omit<DeviceConfig, 'name'>>,
        devices?: {
            [mac: string]: Partial<DeviceConfig>
        }
    }

    export type DeviceConfig = {
        name: string,
        stopButton: boolean;
        invertOpenClose: boolean,
        openCloseTime: number
    }

    export type DeviceUpdateHandler = (device: Device.Update, type: UpdateType) => void | Promise<void>;
    export enum UpdateType {
        Report,
        Poll,
        Force
    }

    export type Device = {
        id: string,
        type: 'blinds',
        name: string,
        mac: string,
        readonly manufacturer: string;
        readonly model: string;
        state: MotionBridge.Device.State;
    }

    export namespace Device {

        export type WriteState = {
            operation?: 'open' | 'close' | 'stop' | 'unknown',
            position?: number
        }

        export type State = Required<WriteState> & {
            batteryLevel?: number, //dc motor only
            charging?: boolean,
            signalStrength: number
        }

        export type Update = {
            deviceId: string;
            state: Partial<State>;
        }

    }

}

export const toDevice = (apiDevice: API.MotionDevice, config: MotionBridge.Config): MotionBridge.Device => {
    const { mac, data } = apiDevice;
    const name = config.devices?.[apiDevice.mac]?.name ?? apiDevice.mac;
    return {
        id: mac,
        type: 'blinds',
        name,
        mac,
        manufacturer: 'MOTIONS',
        model: API.BlindType[data.type],
        state: toState(apiDevice)
    }
}

export const toState = (apiDevice: API.MotionDevice): MotionBridge.Device.State => {
    const operation = apiDevice.data.operation === API.Operation.Stop ? 'stop' :
            apiDevice.data.operation === API.Operation.OpenUp ? 'open' :
                apiDevice.data.operation === API.Operation.CloseDown ? 'close' :
                    'unknown';
    return {
        operation,
        position: apiDevice.data.currentPosition,
        charging: !!apiDevice.data.chargingState,
        batteryLevel: API.batteryInfo(apiDevice.data.batteryLevel)[1],
        signalStrength: apiDevice.data.RSSI
    }
}

export const toDeviceUpdate = (state: MotionBridge.Device.WriteState): API.DeviceUpdate => {
    const operation = state.operation === 'open' ? API.Operation.OpenUp :
        state.operation === 'close' ? API.Operation.CloseDown :
            state.operation === 'stop' ? API.Operation.Stop :
                undefined;
    return {
        operation,
        targetPosition: state.position
    };
}

export const toUpdate = (apiDevice: API.MotionDevice): MotionBridge.Device.Update => {
    return {
        deviceId: apiDevice.mac,
        state: toState(apiDevice)
    }
}
