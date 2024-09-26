import EventEmitter from 'events';
import { Availability } from '../Availability.js';
import { Detachable, isNil, isUndefined } from '../common.js';
import { ILogger } from '../Logger.js';
import { API, MotionClient } from './motion/index.js';

export class MotionBridge {

    static async create(config: MotionBridge.Config, logger: ILogger): Promise<MotionBridge> {
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

    constructor(config: MotionBridge.Config, client: MotionClient, logger: ILogger) {
        this.config = config;
        this.client = client;
        this.logger = logger.getLogger('bridge', config.name ?? config.ip);
    }

    get id() {
        return this.client.id;
    }

    get name() {
        return this.config.name;
    }

    get available() {
        return this.client.availability.available;
    }

    async start() {
        this.client.on('error', error => {
            this.logger.error(`Bridge encountered an error. ${error}`);
        });
        this.client.on('deviceUpdate', (device) => {
            const change = toStateChange(device);
            this.emitter.emit('deviceStateChanged', change);
        });
        await this.client.start();
        this.logger.debug(`Bridge client started [${this.config.ip}], name [${this.config.name}]`);
    }

    async close() {
        this.logger.info(`closing...`);
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
    on(event: "deviceStateChanged", handler: (event: MotionBridge.Device.StateChange) => void): Detachable;
    on(event: "availability" | "deviceStateChanged", handler: (event: any) => void): Detachable {
        switch (event) {
            case 'availability':
                return this.client.availability.on('change', handler);
            default:
                this.emitter.on('deviceStateChanged', handler);
                return { detach: () => this.emitter.off('deviceStateChanged', handler) };
        }
    }
}


export namespace MotionBridge {

    export type Config = {
        ip: string,
        key: string,
        name?: string,
        deviceDefaults?: Partial<Omit<DeviceConfig, 'name'>>,
        devices?: {
            [mac: string]: Partial<DeviceConfig>
        }
    }

    export type DeviceConfig = {
        name: string,
        stopButton: boolean;
        invertOpenClose: boolean
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

        export type StateChange = {
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

export const toStateChange = (apiDevice: API.MotionDevice): MotionBridge.Device.StateChange => {
    return {
        deviceId: apiDevice.mac,
        state: toState(apiDevice)
    }
}
