export type Detachable = { detach: () => void; }
export type Nil = null | undefined;

export const isNil = (value: any): value is Nil => value === null || value === undefined;
export const isUndefined = (value: any): value is undefined => value === undefined;
export const isString = (value: any): value is string => !isNil(value) && typeof value === 'string';
export const isBoolean = (value: any): value is boolean => !isNil(value) && typeof value === 'boolean';
export const isNumber = (value: any): value is number => !isNil(value) && typeof value === 'number';
export const isError = (value: any): value is Error => !isNil(value) && Object.prototype.toString.call(value) === '[object Error]';

export type JSONPrimitive = string | number | boolean | null;
export type JSONArray = JSONValue[];
export type JSONValue =  JSONPrimitive | JSONObject | JSONArray;
export type JSONObject = { [key: string]: JSONValue };

export const bound = (value: number, min: number, max: number) => {
    return Math.min(Math.max(min, value), max)
}

export const cleanMapAsync = async <K extends string = string, V = any>(map: { [key in K]: V }, cb: (key: K, val: V) => void | Promise<void>) => {
    for (let key of Object.keys(map)) {
        const val = map[key];
        delete map[key];
        await cb(key as K, val);
    }
}

export function reverseMap<K extends string | number, V extends string | number>(map: { [key in K]: V }): { [key in V]: K } {
    return Object.keys(map).reduce((result, key) => {
        result[map[key]] = key;
        return result;
    }, { } as { [key in V]: K });
}

// export const reverseMap = <K, V>(map: { [key: K]}: V }): { [key: map[K]]: K } => {
//
// }

export const cleanArrayAsync = async <T = any>(array: T[], cb: (value: T) => void | Promise<void>) => {
    while (array.length > 0) {
        const value = array.pop();
        if (value) {
            await cb(value);
        }
    }
}

export const spliceFirstMatch = <T = any>(array: T[], predicate: (value: T) => boolean): T | undefined => {
    const index = array.findIndex(predicate);
    if (index < 0) {
        return;
    }
    const removed = array[index];
    array.splice(index, 1);
    return removed;
}

export const asyncForEach = async <T = any>(array: T[], cb: (value: T, index: number) => Promise<void>) => {
    for (let i = 0; i < array.length; i++) {
        await cb(array[i], i);
    }
}