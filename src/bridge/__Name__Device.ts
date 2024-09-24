export type __Name__Device<State extends __Name__Device.State = __Name__Device.State> = {

    readonly id: string,
    readonly name: string,
    readonly type: 'light';

    readonly manufacturer: string;
    readonly model: string;
    readonly version: string;
    readonly serialNumber: string;

    state: State;
}

export namespace __Name__Device {

    export type State = any; // change to a more specific type

    export type StateChange = {
        deviceId: string;
        state: State;
    }
}