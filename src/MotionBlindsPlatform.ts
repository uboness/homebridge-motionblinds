import {
    API,
    Characteristic,
    DynamicPlatformPlugin,
    Logger,
    PlatformAccessory,
    PlatformConfig,
    Service
} from 'homebridge';
import { MotionBridge } from './bridge/index.js';
import { asyncForEach, cleanArrayAsync, cleanMapAsync, isString, isUndefined, spliceFirstMatch } from './common.js';
import { Device, Devices } from './device/index.js';
import { ContextLogger, ILogger } from './Logger.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import DeviceConfig = MotionBridge.DeviceConfig;

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class MotionBlindsPlatform implements DynamicPlatformPlugin {

    public readonly Service: typeof Service;
    public readonly Characteristic: typeof Characteristic;

    private readonly log: Logger;
    public readonly logger: ILogger;
    private readonly config: PlatformConfig;
    private readonly api: API;
    private readonly accessories: PlatformAccessory[] = [];

    private readonly bridges: { [id: string]: MotionBridge } = {};
    private readonly devices: { [bridgeId: string]: Device[] } = {};

    constructor(log: Logger, config: PlatformConfig, api: API) {
        this.log = log;
        this.logger = new ContextLogger(log);
        this.config = preProcessConfig(config);
        this.api = api;

        this.Service = api.hap.Service;
        this.Characteristic = api.hap.Characteristic;

        // When this event is fired it means Homebridge has restored all cached accessories from disk.
        // Dynamic Platform plugins should only register new accessories after this event was fired,
        // in order to ensure they weren't added to homebridge already. This event can also be used
        // to start discovery of new accessories.
        this.api.on('didFinishLaunching', () => this.init());
        this.api.on('shutdown', async () => {
            await cleanMapAsync(this.bridges, async (id, bridge) => {
                await bridge?.close();
            });
            await cleanMapAsync(this.devices, async (hubId, devices) => {
                await cleanArrayAsync(devices, device => device.close());
            });
        });
    }

    configureAccessory(accessory: PlatformAccessory) {
        this.accessories.push(accessory);
    }

    /**
     * Initializes the platform. All devices are fetched form the configured MOTION bridges and are registered
     * as accessories in Homebridge. The Accessories are registered once, previously created accessories
     * not registered again to prevent "duplicate UUID" errors. Also, any known accessories which represent
     * devices that no longer exist in any of the bridges will be removed.
     *
     * Since this is a dynamic platform, `deviceAdded` and `deviceRemoved` events will be listened to on
     * the hub and the relevant accessories will dynamically be created/registered or removed/unregistered
     * accordingly.
     */
    async init() {

        const bridgeConfigs = this.config.bridges as MotionBridge.Config[] || [];
        for (const bridgeConfig of bridgeConfigs) {
            try {
                const bridge = await MotionBridge.create(bridgeConfig, this.logger);
                this.bridges[bridge.id] = bridge;
                this.devices[bridge.id] = [];
            } catch (error) {
                this.log.error(`Failed to load bridge [${bridgeConfig.id}]. Make sure it's properly configured  ${error}`);
                throw error;
            }
        }

        // now that all the bridges are loaded, we'll first clean up the cached accessories that
        // belong to bridges that are no long available
        const indices: number[] = [];
        for (let i = 0; i < this.accessories.length; i++) {
            const accessory = this.accessories[i];
            const bridge = this.bridges[accessory.context.bridgeId];
            if (!bridge) {
                this.log.info(`Unregistering accessory from bridge [${accessory.context.bridgeName}] and device [${accessory.displayName}] (MOTION bridge no longer available)`);
                this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [ accessory ]);
                indices.push(i);
            }
        }
        indices.forEach(i => this.accessories.splice(i, 1));

        for (const bridge of Object.values(this.bridges)) {
            this.initBridge(bridge, 0, this.config.connectionRetries ?? 5);
        }

        this.log.info(`initialized`);
    }

    initBridge(bridge: MotionBridge, attempt: number, maxRetries: number) {
        if (attempt === maxRetries) {
            this.log.error(`Failed to connect to bridge [${bridge.name}][${bridge.ip}] ${maxRetries} times... aborting`);
            return;
        }
        if (attempt === 0) {
            this.log.info(`Re/connecting to bridge [${bridge.ip}]...`);
        } else {
            this.log.info(`Re/connecting to bridge [${bridge.ip}] (attempt [${attempt}])...`);
        }

        this.startBridge(bridge)
            .then(() => {
                this.log.info(`Connected bridge [${bridge.ip}].`);
            })
            .catch(error => {
                this.log.error(`Failed to connect to bridge [${bridge.ip}]. ${error}`);
                const seconds = Math.pow(2, attempt) * 5;
                this.log.info(`[${bridge.name}][${bridge.ip}] Retrying to connect in ${seconds} seconds`);
                setTimeout(() => this.initBridge(bridge, attempt + 1, maxRetries), seconds * 1000);
            });
    }


    async startBridge(bridge: MotionBridge) {
        this.log.info(`Connecting to bridge [${bridge.ip}]...`);

        try {
            await bridge.start();
        } catch (error) {

            // we need to mark all the cached accessories belonging to this bridge as inactive
            for (let i = 0; i < this.accessories.length; i++) {
                const accessory = this.accessories[i];
                if (accessory.context.bridgeId === bridge.id) {
                    const service = accessory.getService(accessory.context.primaryService) ?? accessory.getService(this.Service.WindowCovering);
                    if (service) {
                        service.setCharacteristic(this.Characteristic.StatusFault, this.Characteristic.StatusFault.GENERAL_FAULT);
                    }
                }
            }

            throw error;
        }

        this.log.info(`Bridge [${bridge.name}(${bridge.ip})] connected`);
        this.bridges[bridge.id] = bridge;
        this.devices[bridge.id] = [];


        // we'll first get rid of all accessories that are no longer available on the bridge
        const indices: number[] = [];
        for (let i = 0; i < this.accessories.length; i++) {
            const accessory = this.accessories[i];
            if (accessory.context.bridgeId === bridge.id) {
                const device = await bridge.getDevice(accessory.context.deviceId);
                if (!device) {
                    this.log.info(`Unregistering accessory from bridge [${accessory.context.bridgeName}] and device [${accessory.displayName}] (Device no longer available)`);
                    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [ accessory ]);
                    indices.push(i);
                }
            }
        }
        indices.forEach(i => this.accessories.splice(i, 1));

        // now register all the bridge accessories

        const devices = await bridge.listDevices();
        for (const device of devices) {
            await this.registerDevice(bridge, device);
        }

        bridge.on('availability', async (available) => {
            this.devices[bridge.id].forEach(device => device.setAvailable(available));
            if (available) {
                return this.refreshDevices(bridge);
            }
        });

        bridge.on('deviceUpdate', ((update, source) => {
            const device = this.devices[bridge.id].find(device => device.id === update.deviceId);
            if (device) {
                this.log.debug(`hub [${bridge.name}] device [${device.device.name}] state changed [${JSON.stringify(update)}]`);
                device.update(update.state, source);
            }
        }));

    }

    /**
     * this will be called whenever the bridge becomes available again (after it was unavailable)
     * This will fetch all the devices from the bridge hub and update the appropriate HB devices.
     * Takes care of:
     *   - if some devices were removed from the bridge, they should then be unregistered with HB
     *   - if some devices were introduced in the bridge, they should then be registered with HB
     *   - for all the already existing devices, their attributes should be updated.
     */
    private async refreshDevices(bridge: MotionBridge) {
        const freshDevices = await bridge.listDevices();
        const knownDevices = this.devices[bridge.id];
        await asyncForEach(knownDevices, async knownDevice => {
            const freshDevice = freshDevices.find(freshDevice => freshDevice.id === knownDevice.id);
            if (freshDevice) {
                // the known device still exists in the hub... we'll just update its attributes
                await knownDevice.update(freshDevice.state, MotionBridge.UpdateType.Force);
            } else {
                // the know device no longer exists in the hub, we'll need to remove/unregister it
                await this.unregisterDevice(bridge, knownDevice);
            }
        });
        await asyncForEach(freshDevices, async device => {
            if (!knownDevices.find(knownDevice => knownDevice.id === device.id)) {
                await this.registerDevice(bridge, device);
            }
        });
    }

    async registerDevice(bridge: MotionBridge, device: MotionBridge.Device) {
        if (isUndefined(Devices[device.type])) {
            return;
        }

        // generate a unique id for the accessory this should be generated from
        // something globally unique, but constant, for example, the device serial
        // number or MAC address
        const uuid = this.api.hap.uuid.generate(`${bridge.id}:${device.id}`);

        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        let accessory = this.accessories.find(accessory => accessory.UUID === uuid);

        const deviceName = device.name || `${device.type} - ${device.mac}`;
        if (!accessory) {
            accessory = new this.api.platformAccessory(deviceName, uuid);
            accessory.context.bridgeId = bridge.id;
            accessory.context.bridgeName = bridge.name;
            accessory.context.deviceId = device.id;
            accessory.context.deviceName = deviceName;
            this.logger.info(`[${bridge.name}] registering [${device.type}] device [${accessory.displayName}]`);
            this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [ accessory ]);
            this.accessories.push(accessory);
        } else {
            accessory.context.deviceName = deviceName;
            accessory.displayName = deviceName;
            this.logger.info(`[${bridge.name}] found [${device.type}] device [${accessory.displayName}]`);
        }

        accessory.on('identify', async () => {
            this.logger.debug(`Requested to identify [${bridge.name}][${device.id}], but MOTION bridge does not support device identification`);
            //todo simulate identifying by moving the blinds up & down???
        });


        accessory.getService(this.Service.AccessoryInformation)!
            .setCharacteristic(this.Characteristic.Name, accessory.displayName)
            .setCharacteristic(this.Characteristic.ConfiguredName, accessory.displayName)
            .setCharacteristic(this.Characteristic.Manufacturer, device.manufacturer)
            .setCharacteristic(this.Characteristic.Model, device.model)
            .setCharacteristic(this.Characteristic.SerialNumber, device.mac);

        const config: DeviceConfig = {
            name: deviceName,
            invertOpenClose: false,
            stopButton: false,
            openCloseTime: MotionBridge.DEFAULT_OPEN_CLOSE_TIME,
            ...(bridge.config.deviceDefaults ?? {}),
            ...(bridge.config.devices?.[device.mac] ?? {})
        };

        const d = await Devices[device.type]!.create(this, bridge, accessory, device, config);
        accessory.context.primaryService = d.primaryServiceType;
        this.devices[bridge.id].push(d);
    }

    private async unregisterDevice(bridge: MotionBridge, deviceOrId: string | Device) {
        const deviceId = isString(deviceOrId) ? deviceOrId : deviceOrId.id;
        const deviceIndex = this.devices[bridge.id].findIndex(device => device.id === deviceId);
        if (deviceIndex < 0) {
            this.log.debug(`device [${deviceOrId}] was removed from MOTION bridge [${bridge.name}] but was not registered with Homebridge`);
            return;
        }
        const [ registeredDevice ] = this.devices[bridge.id].splice(deviceIndex, 1);
        this.log.info(`[${bridge.name}] unregistering accessory [${registeredDevice.accessory.displayName}] (no longer available)`);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [ registeredDevice.accessory ]);
        spliceFirstMatch(this.accessories, accessory => accessory.UUID === registeredDevice.accessory.UUID);
        await registeredDevice.close();
    }
}

const preProcessConfig = (config: PlatformConfig): PlatformConfig => {
    const { bridges, ...newConfig } = config;
    newConfig.bridges = bridges.map(bridge => {
        const { devices, ...newBridge } = bridge;
        newBridge.devices = devices.reduce((devices, device) => {
            const { mac, ...deviceConfig } = device;
            devices[mac] = deviceConfig;
            return devices;
        }, {});
        return newBridge;
    });
    return newConfig;
};