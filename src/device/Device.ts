import { __Name__Platform } from '../__Name__Platform.js';
import { PlatformAccessory, Service } from 'homebridge';
import { __Name__Bridge } from '../bridge/index.js';
import { ILogger } from '../Logger.js';
import { __Name__Device } from '../bridge/__Name__Device.js';

export abstract class Device {

    readonly bridge: __Name__Bridge;
    readonly platform: __Name__Platform;
    readonly accessory: PlatformAccessory;
    readonly primaryService: Service;
    readonly device: __Name__Device;
    readonly logger: ILogger;

    private _available: boolean;

    protected constructor(platform: __Name__Platform, bridge: __Name__Bridge, accessory: PlatformAccessory, device: __Name__Device, primaryService: Service) {
        this.platform = platform;
        this.bridge = bridge;
        this.accessory = accessory;
        this.logger = platform.logger.getLogger(this.type, this.name);
        this.primaryService = primaryService;
        this.device = device;
        this._available = true;
        this.primaryService.setPrimaryService(true);
        this.primaryService.setCharacteristic(platform.Characteristic.Name, accessory.displayName);
        let status = this.primaryService.getCharacteristic(platform.Characteristic.StatusActive);
        if (!status) {
            status = this.primaryService.addCharacteristic(platform.Characteristic.StatusActive);
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
        this.primaryService.getCharacteristic(this.platform.Characteristic.StatusActive).updateValue(available);
    }

    abstract update(state: __Name__Device.State);

    abstract close(): Promise<void>;
}

export namespace Device {

    export type Factory<T extends Device = Device> = {
        create: (platform: __Name__Platform, bridge: __Name__Bridge, accessory: PlatformAccessory, device: __Name__Device) => Promise<T>
    }

}