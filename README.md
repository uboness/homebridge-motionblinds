<p align="center">

</p>

<span align="center">

# Homebridge MotionBlinds Plugin

Connects to MOTION Wi-Fi Mini bridge and enables controller MotionBlinds curtains.

### !! Experimental !!

</span>

> [!IMPORTANT]
> This is an experimental plugin. Supporting this plugin is not necessarily a priority, so use at your own risk. (you can open tickets if you'd like, response times are not guaranteed though)


> [!IMPORTANT]
> This plugin currently only supports Roller Blinds. Was only tested on:
> - Retrofit Motor CMD-02-P 433MHz

> [!NOTE]
> MOTION API was heavily influenced by https://github.com/jhurliman/node-motionblinds


### Settings

It's possible to configure multiple wifi bridges from which this plugin will load all devices.
Here's a sample configuration:

```json
{
    "bridges": [
        {
            "ip": "192.168.1.xxx",
            "key": "xxxxxxxx-xxxx-xx",
            "name": "Living Room",
            "deviceDefaults": {
                "stopButton": true,
                "invertOpenClose": true
            },
            "devices" : [
                {
                    "mac": "x1x1x1x1x1x1x1x1",
                    "name": "Left Curtain",
                    "invertOpenClose": false
                },
                {
                  "mac": "X2X2X2X2X2X2X2X2",
                  "name": "Right Curtain"
                }
            ]
        }
    ],
    "platform": "MotionBlinds"
}
```

The above example configures a single bridge. By default, all the devices that will be loaded from this bridgge
will include a "Stop" button (that will enable you to "stop" the blind while it's opening/closing) and the open/close
notions will be inverted. Two of the loaded devices (identified by their MAC address) also have dedicated settings, namely:
- "name" - A user friendly name (when not configured, the device's MAC will be used)
- "invertOpenClose" - The "Left Curtain" was installed "upside down" and therefore we need to invert it's orientation.

Here's a list of all the possible settings per bridge

| Setting                          | type          | required | Description                                                                                                                                                                                                         |
|----------------------------------|---------------|----------|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `ip`                             | string        | required | The IP address of the bridge (it is recommended to fix this IP in your network router)                                                                                                                              |
| `key`                            | string        | required | The API key for the bridge (can be found by tapping multiple times on the `Settings -> About MOTION` page in the MotionBlinds app                                                                                   |
| `name`                           | string        | optional | A user friendly name for the bridge (defaults to the bridge's IP)                                                                                                                                                   |
| `deviceDefaults.stopButton`      | boolean       | optional | Some apps/interfaces don't enable the user to stop the current operation of the blind. When `true` a `Stop` button will be added to the accessory that will enable you to do that (default: `false`)                |
| `deviceDefaults.invertOpenClose` | boolean       | optional | Sometimes the default orientation of the blind doesn't fit your needs (e.g. Is 100% considered closed or open?). Toggling this settings will change the orientation of the blind to your likings (default: `false`) |
| `devices`                        | array<device> | optional | An array of per-device settings for further customisation.                                                                                                                                                          |

Here's a list of the settings available per-device:

| Setting           | type     | required | Description                                                                                                                                                                                                         |
|-------------------|----------|----------|:--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `mac`             | string   | required | The MAC address of the device (serves as the identifier of the device)                                                                                                                                              |
| `name`            | string   | optional | A user friendly name for the device (defaults to its MAC address)                                                                                                                                                   |
| `stopButton`      | boolean  | optional | Enables overriding the default `deviceDefaults.stopButton` per device                                                                                                                                               |
| `invertOpenClose` | boolean  | optional | Enables overriding the default `deviceDefaults.invertOpenClose` per device                                                                                                                                               |
