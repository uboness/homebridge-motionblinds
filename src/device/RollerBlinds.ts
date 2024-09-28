import { PlatformAccessory, Service } from 'homebridge';
import { MotionBridge } from '../bridge/index.js';
import { isBoolean, isNumber, isString } from '../common.js';
import { MotionBlindsPlatform } from '../MotionBlindsPlatform.js';
import { Device } from './Device.js';

export class RollerBlinds extends Device {

    static readonly create = async (platform: MotionBlindsPlatform, bridge: MotionBridge, accessory: PlatformAccessory, device: MotionBridge.Device, config: MotionBridge.DeviceConfig) => {
        return new RollerBlinds(platform, bridge, accessory, device, config);
    }

    // The bridge polls the devices for their states and tries to update them. This device can decide to skip
    // these updates based on its state. For example, when an operation is originated from this device, 'open' or 'close'
    // we mark the position state as "opening" or "closing" respectfully, if an update arrives right after the change
    // it might change its position state back to `stop` (this is because some devices only send their "stop" state).
    // Since each update is associated with an update type (`report`, `poll` or `force`), the device can decide to skip
    // updates for a certain periods (it will work well as long as all the update originate here, but there may be "glitches"
    // if the updates is originated somewhere else, e.g. remote or manual pull)
    private skipPollUpdatesUntil?: number;

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
            .setValue(operationState);

        this.service.getCharacteristic(platform.Characteristic.CurrentPosition)
            .setValue(this.resolvePosition(device.state.position));

        this.service.getCharacteristic(platform.Characteristic.TargetPosition)
            .setValue(this.resolvePosition(device.state.position))
            .onSet(async value => {
                const oldPosition = this.device.state.position;
                const newPosition = this.resolvePosition(<number>value);
                this.device.state.position = newPosition;
                if (oldPosition === newPosition) {
                    return;
                }

                await bridge.updateDevice(device.id, { position: this.device.state.position });

                // computing update skipping time
                const now = Date.now();
                const positionDelta = Math.abs(oldPosition-newPosition);
                const motionTime = Math.trunc((positionDelta / 100) * this.config.openCloseTime);
                this.skipPollUpdatesUntil = now + motionTime;

                const positionState = oldPosition > newPosition ? decreasingState : increasingState;
                setTimeout(() => {
                    this.service.setCharacteristic(platform.Characteristic.PositionState, positionState)
                }, 500);
            });
    }

    update(state: MotionBridge.Device.State, type: MotionBridge.UpdateType) {

        if (type === MotionBridge.UpdateType.Poll && this.skipPollUpdatesUntil && this.skipPollUpdatesUntil > Date.now()) {
            this.logger.debug(`Skipping poll update until [${new Date(this.skipPollUpdatesUntil)}]`);
            return;
        }
        this.skipPollUpdatesUntil = undefined;
        this.logger.debug(`[${MotionBridge.UpdateType[type]}] updating...`);

        if (isString(state.operation)) {
            this.device.state.operation = state.operation;
            const positionState = state.operation == 'open' ? this.resolvePositionState(this.platform.Characteristic.PositionState.INCREASING) :
                state.operation === 'close' ? this.resolvePositionState(this.platform.Characteristic.PositionState.DECREASING) :
                    this.platform.Characteristic.PositionState.STOPPED;
            this.service.setCharacteristic(this.platform.Characteristic.PositionState, positionState);
        }

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
        if (this.config.invertOpenClose) {
            return positionState === this.platform.Characteristic.PositionState.DECREASING ? this.platform.Characteristic.PositionState.INCREASING :
                positionState === this.platform.Characteristic.PositionState.INCREASING ? this.platform.Characteristic.PositionState.DECREASING :
                    positionState;
        }
        return positionState;
    }

    private resolvePosition(position: number): number {
        return this.config.invertOpenClose ? 100 - position : position;
    }

}