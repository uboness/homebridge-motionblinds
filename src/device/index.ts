import { MotionBridge } from '../bridge/index.js';
import { Device } from './Device.js';
import { RollerBlinds } from './RollerBlinds.js';

export * from './Device.js';
export * from './RollerBlinds.js';

export const Devices: { [type in MotionBridge.Device['type']]?: Device.Factory } = {
    'blinds': RollerBlinds
}