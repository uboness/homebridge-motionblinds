import { MotionBlindsPlatform } from '../MotionBlindsPlatform.js';
import { PlatformAccessory, Service } from 'homebridge';
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

    private _available: boolean;

    protected constructor(platform: MotionBlindsPlatform, bridge: MotionBridge, accessory: PlatformAccessory, device: MotionBridge.Device, config: DeviceConfig, primaryService: Service) {
        this.platform = platform;
        this.bridge = bridge;
        this.accessory = accessory;
        this.device = device;
        this.config = config;
        this.logger = platform.logger.getLogger(this.type, this.name);
        this.service = primaryService;
        this._available = true;
        this.service.setPrimaryService(true);
        this.service.setCharacteristic(platform.Characteristic.Name, accessory.displayName);
        let status = this.service.getCharacteristic(platform.Characteristic.StatusActive);
        if (!status) {
            status = this.service.addCharacteristic(platform.Characteristic.StatusActive);
        }
        status.setValue(this.available);
    }

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

    set available(available: boolean) {
        this._available = available;
        this.service.getCharacteristic(this.platform.Characteristic.StatusActive).updateValue(available);
    }

    abstract update(state: MotionBridge.Device.WriteState);

    abstract close(): Promise<void>;
}

export namespace Device {

    export type Factory<T extends Device = Device> = {
        create: (platform: MotionBlindsPlatform, bridge: MotionBridge, accessory: PlatformAccessory, device: MotionBridge.Device, config: MotionBridge.DeviceConfig) => Promise<T>
    }

}