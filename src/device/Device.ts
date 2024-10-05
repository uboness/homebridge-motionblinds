import { MotionBlindsPlatform } from '../MotionBlindsPlatform.js';
import { Characteristic, PlatformAccessory, Service, WithUUID } from 'homebridge';
import { MotionBridge } from '../bridge/index.js';
import { ILogger } from '../Logger.js';
import DeviceConfig = MotionBridge.DeviceConfig;

export abstract class Device {

    readonly bridge: MotionBridge;
    readonly platform: MotionBlindsPlatform;
    readonly accessory: PlatformAccessory;
    readonly service: Service;
    readonly device: MotionBridge.Device;
    readonly config: DeviceConfig;
    readonly logger: ILogger;

    readonly statusFault: Characteristic;

    private _available: boolean = false;

    protected constructor(platform: MotionBlindsPlatform, bridge: MotionBridge, accessory: PlatformAccessory, device: MotionBridge.Device, config: DeviceConfig, primaryService: Service) {
        this.platform = platform;
        this.bridge = bridge;
        this.accessory = accessory;
        this.device = device;
        this.config = config;
        this.logger = platform.logger.getLogger(this.type, this.name);
        this.service = primaryService;
        this.service.setPrimaryService(true);
        this.service.setCharacteristic(platform.Characteristic.Name, accessory.displayName);
        this.statusFault = this.service.getCharacteristic(platform.Characteristic.StatusFault) ?? this.service.addCharacteristic(platform.Characteristic.StatusFault);
        this.setAvailable(true);
    }

    abstract get primaryServiceType(): WithUUID<typeof Service>;

    get id() {
        return this.device.id;
    }

    get type() {
        return this.device.type;
    }

    get name() {
        return this.device.name;
    }

    get available() {
        return this._available;
    }

    setAvailable(available: boolean) {
        this._available = available;
        this.statusFault.setValue(!available);
    }

    abstract update(state: MotionBridge.Device.WriteState, type: MotionBridge.UpdateType);

    abstract close(): Promise<void>;
}

export namespace Device {

    export type Factory<T extends Device = Device> = {
        create: (platform: MotionBlindsPlatform, bridge: MotionBridge, accessory: PlatformAccessory, device: MotionBridge.Device, config: MotionBridge.DeviceConfig) => Promise<T>
    }

}