import { Device } from './Device.js';
import { Light } from './Light.js';
import { __Name__Device } from '../bridge/__Name__Device.js';

export * from './Device.js';
export * from './Light.js';

export const Devices: { [type in __Name__Device['type']]?: Device.Factory } = {
    'light': Light
}