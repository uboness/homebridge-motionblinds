import { API } from 'homebridge';

import { PLATFORM_NAME } from './settings';
import { __Name__Platform } from './__Name__Platform';

/**
 * This method registers the platform with Homebridge
 */
export = (api: API) => {
  api.registerPlatform(PLATFORM_NAME, __Name__Platform);
};
