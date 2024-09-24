import {
    API,
    DynamicPlatformPlugin,
    Logger,
    PlatformAccessory,
    PlatformConfig,
    Service,
    Characteristic
} from 'homebridge';

import { Device, Devices } from './device/index.js';
import { __Name__Bridge } from './bridge/index.js';
import { asyncForEach, isString, isUndefined, spliceFirstMatch } from './common.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { ContextLogger, ILogger } from './Logger.js';
import { __Name__Device } from './bridge/__Name__Device.js';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class __Name__Platform implements DynamicPlatformPlugin {

    public readonly Service: typeof Service;
    public readonly Characteristic: typeof Characteristic;

    public readonly logger: ILogger;
    private readonly config: PlatformConfig;
    private readonly api: API;
    private readonly accessories: PlatformAccessory[] = [];

    private bridge?: __Name__Bridge;
    private readonly devices: Device[] = [];

    constructor(log: Logger, config: PlatformConfig, api: API) {
        this.logger = new ContextLogger(log);
        this.config = config;
        this.api = api;
        this.Service = api.hap.Service;
        this.Characteristic = api.hap.Characteristic;

        this.api.on('didFinishLaunching', () => this.discoverDevices());
    }

    configureAccessory(accessory: PlatformAccessory) {
        this.accessories.push(accessory);
    }

    async discoverDevices() {

        this.bridge = await this.initBridge();

        // first, let's clean up the cached accessories that are no long available
        const indices = [] as number[];
        await asyncForEach(this.accessories, async (accessory, i) => {
            if (!await this.bridge?.getDevice(accessory.context.id)) {
                indices.push(i);
            }
        });
        indices.forEach(i => this.accessories.splice(i, 1));

        // now register all accessories
        const devices = await this.bridge.listDevices();
        for (const device of devices) {
            await this.registerDevice(this.bridge, device);
        }

        this.bridge.on('availability', async availability => {
            this.devices.forEach(device => device.available = availability.available);
            if (availability.available) {
                return this.refreshDevices(this.bridge!);
            }
        });

        this.bridge.on('deviceStateChanged', change => {
            const device = this.devices.find(device => device.id === change.deviceId);
            if (device) {
                device.update(change.state);
            }
        });

        this.bridge.on('deviceAdded', device => {
            this.registerDevice(this.bridge!, device);
        });

        this.bridge.on('deviceRemoved', event => {
            this.unregisterDevice(this.bridge!, event.deviceId);
        });

    }

    async initBridge(): Promise<__Name__Bridge> {
        return new __Name__Bridge(this.config);
    }

    async registerDevice(bridge: __Name__Bridge, device: __Name__Device) {
        if (isUndefined(Devices[device.type])) {
            return
        }

        // generate a unique id for the accessory this should be generated from
        // something globally unique, but constant, for example, the device serial
        // number or MAC address
        const uuid = this.api.hap.uuid.generate(`${bridge.id}:${device.type}:${device.serialNumber}`);

        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        let accessory = this.accessories.find(accessory => accessory.UUID === uuid);

        if (!accessory) {
            const deviceName = device.name || device.type;
            accessory = new this.api.platformAccessory(deviceName, uuid);
            accessory.context.bridgeId = bridge.id;
            accessory.context.bridgeName = bridge.name
            accessory.context.deviceId = device.id;
            accessory.context.deviceName = deviceName;
            this.logger.info(`[${bridge.name}] registering [${device.type}] device [${accessory.displayName}]`);
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [ accessory ]);
            this.accessories.push(accessory);
        } else {
            this.logger.info(`[${bridge.name}] found [${device.type}] device [${accessory.displayName}]`);
        }

        if (bridge.identifyDevice) {
            accessory.on('identify', async () => {
                this.logger.debug(`Identifying [${bridge.name}][${device.id}]`);
                await bridge.identifyDevice!(device.id);
            });
        }

        accessory.getService(this.Service.AccessoryInformation)!
            .setCharacteristic(this.Characteristic.Name, accessory.displayName)
            .setCharacteristic(this.Characteristic.Manufacturer, device.manufacturer)
            .setCharacteristic(this.Characteristic.Model, device.model)
            .setCharacteristic(this.Characteristic.FirmwareRevision, device.version)
            .setCharacteristic(this.Characteristic.SerialNumber, device.serialNumber);

        this.devices.push(await Devices[device.type]!.create(this, bridge, accessory, device));
    }

    /**
     * this will be called whenever the hub becomes available again (after it was unavailable)
     * This will fetch all the devices from the DIRIGERA hub and update the appropriate HB devices.
     * Takes care of:
     *   - if some devices were removed from DIREGERA, they should then be unregistered with HB
     *   - if some devices were introduced in DIREGERA, they should then be registered with HB
     *   - for all the already existing devices, their attributes should be updated.
     */
    private async refreshDevices(bridge: __Name__Bridge) {
        const freshDevices = await bridge.listDevices();
        await asyncForEach(this.devices, async knownDevice => {
            const freshDevice = freshDevices.find(freshDevice => freshDevice.id === knownDevice.id);
            if (freshDevice) {
                // the known device still exists in the hub... we'll just update its attributes
                await knownDevice.update(freshDevice);
            } else {
                // the known device no longer exists in the bridge, we'll need to remove/unregister it
                await this.unregisterDevice(bridge, knownDevice);
            }
        });
        await asyncForEach(freshDevices, async device => {
            if (!this.devices.find(knownDevice => knownDevice.id === device.id)) {
                await this.registerDevice(this.bridge!, device);
            }
        });
    }

    private async unregisterDevice(bridge: __Name__Bridge, deviceOrId: Device | string) {
        const deviceId = isString(deviceOrId) ? deviceOrId : deviceOrId.id;
        const deviceIndex = this.devices.findIndex(device => device.id === deviceId);
        if (deviceIndex < 0) {
            this.logger.debug(`device [${deviceOrId}] was removed from bridge but was not registered with Homebridge`);
            return;
        }
        const [ registeredDevice ] = this.devices.splice(deviceIndex, 1);
        this.logger.info(`Unregistering accessory [${bridge.name}][${registeredDevice.accessory.displayName}] (no longer available)`);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [ registeredDevice.accessory ]);
        spliceFirstMatch(this.accessories, accessory => accessory.UUID === registeredDevice.accessory.UUID);
        await registeredDevice.close();
    }
}
