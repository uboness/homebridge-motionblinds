import { PlatformAccessory, Service } from 'homebridge';
import { MotionBridge } from '../bridge/index.js';
import { isBoolean, isNumber } from '../common.js';
import { MotionBlindsPlatform } from '../MotionBlindsPlatform.js';
import { Device } from './Device.js';

export class RollerBlinds extends Device {

    static readonly create = async (platform: MotionBlindsPlatform, bridge: MotionBridge, accessory: PlatformAccessory, device: MotionBridge.Device, config: MotionBridge.DeviceConfig) => {
        return new RollerBlinds(platform, bridge, accessory, device, config);
    }

    private battery?: Service;
    private stopButton?: Service;

    private constructor(platform: MotionBlindsPlatform, bridge: MotionBridge, accessory: PlatformAccessory, device: MotionBridge.Device, deviceConfig: MotionBridge.DeviceConfig) {
        super(platform, bridge, accessory, device, deviceConfig, accessory.getService(platform.Service.WindowCovering) ?? accessory.addService(platform.Service.WindowCovering));

        if (isNumber(device.state.batteryLevel)) {
            this.battery = accessory.getService(platform.Service.Battery) ?? accessory.addService(platform.Service.Battery);
            this.battery.getCharacteristic(platform.Characteristic.BatteryLevel)
                .setValue(device.state.batteryLevel);

            if (isBoolean(device.state.charging)) {
                this.battery.getCharacteristic(platform.Characteristic.ChargingState)
                    .setValue(device.state.charging);
            }
        }

        if (isNumber(device.state.signalStrength)) {
            this.service.getCharacteristic(platform.Characteristic.TransmitPower)
                .setValue(device.state.signalStrength);
        }

        this.service.getCharacteristic(platform.Characteristic.HoldPosition)
            .onSet(async (hold) => {
                if (hold) {
                    await bridge.updateDevice(device.id, { operation: 'stop' });
                    setTimeout(() => {
                        this.service.setCharacteristic(platform.Characteristic.HoldPosition, false);
                    }, 500)
                }
            });

        this.stopButton = accessory.getServiceById(platform.Service.Switch, 'stop');
        if (this.config.stopButton) {
            if (!this.stopButton) {
                this.stopButton = accessory.addService(platform.Service.Switch, `${accessory.displayName} Stop`, 'stop');
            }
            this.stopButton
                // .setCharacteristic(platform.Characteristic.StatusActive, true)
                .setCharacteristic(platform.Characteristic.Name, `${device.name} Stop`)
                // .setCharacteristic(platform.Characteristic.ConfiguredName, `${device.name} Stop`)
                .getCharacteristic(platform.Characteristic.On)
                .onSet((on) => {
                    if (on) {
                        setTimeout(() => {
                            this.stopButton!.setCharacteristic(platform.Characteristic.On, false);
                            this.service.setCharacteristic(platform.Characteristic.HoldPosition, true);
                        }, 500);
                    }
                });
        } else if (this.stopButton) {
            accessory.removeService(this.stopButton);
        }

        const decreasingState = this.resolvePositionState(this.platform.Characteristic.PositionState.DECREASING);
        const increasingState = this.resolvePositionState(this.platform.Characteristic.PositionState.INCREASING);

        const operationState = this.device.state.operation === 'close' ? decreasingState :
            this.device.state.operation === 'open' ? increasingState :
                this.platform.Characteristic.PositionState.STOPPED;
        this.service.getCharacteristic(platform.Characteristic.PositionState)
            .setValue(operationState)

        this.service.getCharacteristic(platform.Characteristic.CurrentPosition)
            .setValue(this.resolvePosition(device.state.position));

        this.service.getCharacteristic(platform.Characteristic.TargetPosition)
            .setValue(this.resolvePosition(device.state.position))
            .onSet(async value => {
                const oldPosition = this.device.state.position;
                this.device.state.position = this.resolvePosition(<number>value);
                if (oldPosition === this.device.state.position) {
                    return;
                }
                await bridge.updateDevice(device.id, { position: this.device.state.position });
                const positionState = oldPosition > this.device.state.position ? decreasingState : increasingState;
                setTimeout(() => {
                    this.service.setCharacteristic(platform.Characteristic.PositionState, positionState)
                }, 50);
            });
    }

    update(state: MotionBridge.Device.State) {

        // the MOTION bridge only reports an update once the blind operation stopped, so the position state will
        // always be stopped
        this.device.state.operation = 'stop';
        this.service.setCharacteristic(this.platform.Characteristic.PositionState, this.platform.Characteristic.PositionState.STOPPED);

        if (isNumber(state.batteryLevel) && this.battery) {
            this.device.state.batteryLevel = state.batteryLevel;
            this.battery.setCharacteristic(this.platform.Characteristic.BatteryLevel, this.device.state.batteryLevel);
        }
        if (isBoolean(state.charging) && this.battery) {
            this.device.state.charging = state.charging;
            this.battery.setCharacteristic(this.platform.Characteristic.ChargingState, state.charging);
        }
        if (isNumber(state.signalStrength)) {
            this.device.state.signalStrength = state.signalStrength;
            this.service.setCharacteristic(this.platform.Characteristic.TransmitPower, state.signalStrength);
        }
        if (isNumber(state.position)) {
            this.device.state.position = state.position;
            this.service.setCharacteristic(this.platform.Characteristic.CurrentPosition, this.resolvePosition(this.device.state.position));
        }
    }

    async close(){
    }

    private resolvePositionState(positionState: number): number {
        return positionState === this.platform.Characteristic.PositionState.DECREASING ? this.platform.Characteristic.PositionState.INCREASING :
            positionState === this.platform.Characteristic.PositionState.INCREASING ? this.platform.Characteristic.PositionState.DECREASING :
                positionState;
    }

    private resolvePosition(position: number): number {
        return this.config.invertOpenClose ? 100 - position : position;
    }

}