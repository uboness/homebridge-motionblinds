const { promises: fs } = require('fs');
const path = require('path');
const { input } = require('@inquirer/prompts');

async function execute() {
    const params = await collectInput();
    console.log(JSON.stringify(params, undefined, 2));
    return processFiles(params);
}

async function processFiles(params) {
    await visitTreeFiles('.', (file, dir) => {
        const filePath = path.join(dir, file.name);
        if (filePath.startsWith('src/')) {
            return true;
        }
        switch (file.name) {
            case 'src':
            case 'LICENSE':
            case 'README.md':
            case 'package.json':
            case 'config.schema.json':
                return true;
            default:
                return false;
        }
    }, (file, dir) => processFile(file, dir, params));
}

async function collectInput() {
    const params = {};

    params.packageName = (await input({
        message: 'Package name (homebridge-?)',
        validate: value => value.startsWith('homebridge-')
    }));

    params.name = (await input({
        message: 'Constructs name? (e.g. "exampleName" will result in constructs such as "exampleName" variables and "ExampleNamePlatform" classes)',
        default: camelCase(params.packageName.substring('homebridge-'.length))
    }));
    params.Name = capitalize(params.name);

    params.short_description = await input({
        message: 'One liner description',
        default: `${humanCase(params.packageName)} Plugin`
    });

    params.short_description = await input({
        message: 'Long description',
        default: `${humanCase(params.packageName)} Plugin`
    });

    return params;
}

async function processFile(file, dir, params) {
    await replaceParams(path.join(dir, file.name), params);
    await renameFile(file, dir, params);
}

async function renameFile(file, dir, params) {
    const regexp = new RegExp(`__(${Object.keys(params).join('|')})__`, 'g');
    const newName = file.name.replace(regexp, match => {
        const param = /__(.+)__/g.exec(match)[1];
        return params[param];
    });
    if (newName !== file.name) {
        await fs.rename(path.join(dir, file.name), path.join(dir, newName));
    }
}

async function replaceParams(filePath, params) {
    const regexp = new RegExp(`__(${Object.keys(params).join('|')})__`, 'g');

    let content = await fs.readFile(filePath, 'utf8');

    // replacePath is your match[1]
    content = content.replace(regexp, (match) => {
        const param = /__(.+)__/g.exec(match)[1];
        return params[param];
    });

    // this will overwrite the original html file, change the path for test
    await fs.writeFile(filePath, content, { encoding: 'utf8' });
}

async function visitTreeFiles(dir, filter, cb) {
    const files = await fs.readdir(dir, {withFileTypes: true});
    for (const file of files) {
        if (filter(file, dir)) {
            if (file.isDirectory()) {
                await visitTreeFiles(path.join(dir, file.name), filter, cb);
            } else {
                await cb(file, dir);
            }
        }
    }
}

function capitalize(name) {
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}`
}

function camelCase(name, upper = false) {
    const tokens = name.split('-');
    return tokens.reduce((result, token, i) => {
        if (i === 0 && !upper) {
            result += token;
        } else {
            result += capitalize(token);
        }
        return result;
    }, '')
}

function humanCase(name) {
    const tokens = name.split('-');
    return tokens.map(capitalize).join(' ');
}

(async () => {
    await execute();
})();