import { MotionClient } from '../bridge/index.js';
import { ConsoleLogger } from '../Logger.js';

const execute  = async () => {

    const settings = parseArgv(process.argv);

    const client  = new MotionClient({
        key: settings.params.key as string,
        ip: settings.params.host as string,
        logger: new ConsoleLogger(true)
    });

    client.on('error', error => {
        console.error(`ERROR: ${error}`);
    });

    client.on('report', (device) => {
        console.log(`device updated [${JSON.stringify(device, undefined, 2)}]`);
    });

    client.on('heartbeat', heartbeat => {
        console.log(`heartbeat [${JSON.stringify(heartbeat, undefined, 2)}]`);
    });

    await client.start();

    let devices = await client.getAllDevices();
    console.log(`devices`, devices);

};

const shorts: Record<string, string> = {
    'k' : 'key',
    'h' : 'host'
}

const parseArgv = (argv: string[]) => {
    const settings: { values: string[], params: Record<string, string | boolean>} = {
        values: [],
        params: {}
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const match = arg.match(/^\-\-?(\w.?)/);
        if (match) {
            const key = !arg.startsWith('--') ? shorts[match[1]] : match[1];
            if (!key) {
                throw new Error(`Unknown parameter [${arg}]`);
            }

            if (i+1 < argv.length) {
                const nextArg = argv[i+1];
                if (!nextArg.match(/^\-\-?\w.?/)) {
                    settings.params[key] = nextArg;
                } else {
                    settings.params[key] = true;
                }
                i++; // we already read the next arg.
            }
        } else {
            settings.values.push(arg)
        }
    }
    return settings;
}

execute().then();