import { MotionClient } from '../bridge/index.js';
import { ConsoleLogger } from '../Logger.js';

(async () => {

    const client  = new MotionClient({
        key: 'xxxxxxxx-xxxx-xx',
        ip: '192.168.x.xx',
        logger: new ConsoleLogger(true)
    });

    client.on('error', error => {
        console.error(`ERROR: ${error}`);
    });

    client.on('deviceUpdate', (device) => {
        console.log(`device updated [${JSON.stringify(device, undefined, 2)}]`);
    });

    client.on('heartbeat', heartbeat => {
        console.log(`heartbeat [${JSON.stringify(heartbeat, undefined, 2)}]`);
    });

    await client.start();

    let devices = await client.getAllDevices();
    console.log(`devices`, devices);

})();



