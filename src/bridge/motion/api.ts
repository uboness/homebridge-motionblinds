import { bound } from '../../common.js';

export namespace API {

    export const VERSION = '0.9'

    export const DEVICE_TYPE_BRIDGE = '02000002' // Bridge
    export const DEVICE_TYPE_BLIND = '10000000' // Standard Blind

    // export type RequestMessageType = 'GetDeviceList' | 'ReadDevice' | 'WriteDevice';
    // export type ResponseMessageType = `${RequestMessageType}Ack`;
    // export type NotificationMessageType = 'Heartbeat' | 'Report';
    // export type MessageType = RequestMessageType | ResponseMessageType | NotificationMessageType;

    export type MotionDevice = {
        mac: string,
        deviceType: DeviceType,
        data: DeviceStatus
    }

    export type DeviceType =
        | typeof DEVICE_TYPE_BRIDGE
        | typeof DEVICE_TYPE_BLIND

    export type DeviceUpdate = {
        operation?: Operation,
        targetPosition?: number
    }

    export type DeviceStatus = {
        type: BlindType,
        operation: Operation,
        currentPosition: number,
        currentAngle: number,
        currentState: LimitsState,
        voltageMode: VoltageMode,
        batteryLevel: number,
        chargingState: ChargingState,
        wirelessMode: WirelessMode,
        RSSI: number
    }

    export type GetDeviceListReq = {
        msgID: string,
        msgType: 'GetDeviceList'
    };

    export type GetDeviceListResp = {
        actionResult?: string,
        msgType: 'GetDeviceListAck',
        mac: string,
        deviceType: DeviceType,
        token: string,
        ProtocolVersion: string,
        data: Array<{ mac: string, deviceType: DeviceType }>
    }

    export type ReadDeviceReq = {
        msgType: 'ReadDevice',
        msgID: string,
        mac: string,
        deviceType: DeviceType
    }

    export type ReadDeviceResp = MotionDevice & {
        actionResult?: string,
        msgType: 'ReadDeviceAck'
    }

    export type WriteDeviceReq = {
        msgType: 'WriteDevice',
        msgID: string,
        mac: string,
        deviceType: DeviceType,
        AccessToken: string,
        data: DeviceUpdate
    }

    export type WriteDeviceResp = MotionDevice & {
        actionResult?: string,
        msgType: 'WriteDeviceAck',
        msgID: number
    }

    export type Heartbeat = {
        msgType: 'Heartbeat',
        mac: string,
        deviceType: DeviceType,
        token: string,
        data: {
            currentState: HeartbeatCurrentState
            numberOfDevices: number
            RSSI: number
        }
    }

    export type Report = MotionDevice & {
        msgType: 'Report',
        msgID: number
    }

    export type Request = GetDeviceListReq | ReadDeviceReq | WriteDeviceReq;
    export type Response = GetDeviceListResp | ReadDeviceResp | WriteDeviceResp;
    export type Notification = Heartbeat | Report;

    export const isGetDeviceListResp = (resp: Response): resp is GetDeviceListResp => resp.msgType === 'GetDeviceListAck';
    export const isReadDeviceResp = (resp: Response): resp is ReadDeviceResp => resp.msgType === 'ReadDeviceAck';
    export const isWriteDeviceResp = (resp: Response): resp is WriteDeviceResp => resp.msgType === 'WriteDeviceAck';
    export const isHeartbeat = (noti: Notification): noti is Heartbeat => noti.msgType === 'Heartbeat';
    export const isReport = (noti: Notification): noti is Notification => noti.msgType === 'Report';


    export type BatteryInfo = [number, number] // [voltage, percent]
    export const batteryInfo = (batteryLevel: number): BatteryInfo => {
        const voltage = batteryLevel / 100.0;
        let percent = 0.0;

        if (voltage > 0.0 && voltage <= 9.4) {
            percent = (voltage - 6.2) / (8.4 - 6.2);    // 2 cel battery pack (8.4V)
        } else if (voltage > 9.4 && voltage <= 13.6) {
            percent = (voltage - 10.4) / (12.6 - 10.4); // 3 cel battery pack (12.6V)
        } else if (voltage > 13.6) {
            percent = (voltage - 14.6) / (16.8 - 14.6); // 4 cel battery pack (16.8V)
        }
        percent = bound(percent, 0.0, 1.0);
        return [voltage, Math.round(percent * 100)];
    }

    export enum BlindType {
        RollerBlind = 1,
        VenetianBlind = 2,
        RomanBlind = 3,
        HoneycombBlind = 4,
        Shangri_LaBlind = 5,
        RollerShutter = 6,
        RollerGate = 7,
        Awning = 8,
        TopDownBottomUp = 9,
        DayNightBlind = 10,
        DimmingBlind = 11,
        Curtain = 12,
        CurtainLeft = 13,
        CurtainRight = 14,
        DoubleRoller = 17,
        Switch = 43,
    }

    export enum Operation {
        CloseDown = 0,
        OpenUp = 1,
        Stop = 2,
        StatusQuery = 5,
    }

    export enum VoltageMode {
        AC = 0,
        DC = 1,
    }

    export enum ChargingState {
        NO = 0,
        YES = 1
    }

    export enum LimitsState {
        NoLimits = 0,
        TopLimitDetected = 1,
        BottomLimitDetected = 2,
        LimitsDetected = 3,
        ThirdLimitDetected = 4,
    }

    export enum WirelessMode {
        UniDirectional = 0,
        BiDirectional = 1,
        BiDirectionalMechanicalLimits = 2,
        Other = 3,
    }

    export enum HeartbeatCurrentState {
        Working = 1,
        Pairing = 2,
        Updating = 3,
    }

}