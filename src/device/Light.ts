import { PlatformAccessory } from 'homebridge';
import { __Name__Bridge } from '../bridge/index.js';
import { __Name__Platform } from '../__Name__Platform.js';
import { Device } from './Device.js';
import { __Name__Device } from '../bridge/__Name__Device.js';

export class Light extends Device {

    static readonly create = async (platform: __Name__Platform, bridge: __Name__Bridge, accessory: PlatformAccessory, device: __Name__Device) => {
        return new Light(platform, bridge, accessory, device);
    }

    private constructor(platform: __Name__Platform, bridge: __Name__Bridge, accessory: PlatformAccessory, device: __Name__Device) {
        super(platform, bridge, accessory, device, accessory.getService(platform.Service.Lightbulb) ?? accessory.addService(platform.Service.Lightbulb));

        this.primaryService.getCharacteristic(platform.Characteristic.On)
            .setValue(this.device.state.isOn)
            .onSet(async (value, context) => {
                const isOn = value as boolean;
                this.device.state.isOn = isOn;
                if (!context?.fromDirigera) {
                    await bridge.setDeviceState(device.id, { isOn });
                }
            });
    }

    update(state: __Name__Device.State) {
        this.device.state = state;
    }

    async close(){
    }



}