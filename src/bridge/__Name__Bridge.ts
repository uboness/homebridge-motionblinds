import { PlatformConfig } from 'homebridge';
import { __Name__Device } from './__Name__Device.js';

export class __Name__Bridge {

    readonly id = '__name__';
    readonly name = '__Name__';

    readonly devices: { [id: string]: __Name__Device } = {};

    constructor(config: PlatformConfig) {
    }

    async getDevice(id: string): Promise<__Name__Device | undefined> {
        return this.devices[id];
    }

    async identifyDevice(id: string): Promise<void> {
    }

    async listDevices(): Promise<__Name__Device[]> {
        return Object.values(this.devices);
    }

    async setDeviceState(id: string, state: __Name__Device.State): Promise<void> {
    }

    on(event: "availability", handler: (event: { available: boolean; error?: string }) => void): void;
    on(event: "deviceStateChanged", handler: (event: __Name__Device.StateChange) => void): void;
    on(event: "deviceAdded", handler: (event: __Name__Device) => void);
    on(event: "deviceRemoved", handler: (event: { deviceId: string; type: __Name__Device["type"] }) => void);
    on(event: "availability" | "deviceStateChanged" | "deviceAdded" | "deviceRemoved", handler: (event: any) => void) {

    }
}