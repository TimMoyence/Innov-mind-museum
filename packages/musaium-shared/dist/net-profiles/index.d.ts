export type NetinfoType = 'none' | 'cellular' | 'wifi';
export type CellularGeneration = '2g' | '3g' | '4g' | '5g';
export type NetworkProfileName = 'offline' | '2g' | 'edge' | '3g-lossy' | 'flapping' | 'normal' | '4g' | '5g' | 'wifi-metered' | 'cellular-degraded';
export type ExpectedDataMode = 'low' | 'normal';
export type ExpectedQuality = 'ok' | 'slow';
export interface DutyCycle {
    readonly onlineMs: number;
    readonly offlineMs: number;
    readonly baseProfile: NetworkProfileName;
}
export interface NetworkProfile {
    readonly name: NetworkProfileName;
    readonly label: string;
    readonly latencyMs: number;
    readonly jitterMs: number;
    readonly bwDownKbps: number;
    readonly bwUpKbps: number;
    readonly lossPct: number;
    readonly netinfoType: NetinfoType;
    readonly cellularGeneration: CellularGeneration | null;
    readonly expectedDataMode: ExpectedDataMode;
    readonly metered: boolean;
    readonly expectedQuality: ExpectedQuality | null;
    readonly dutyCycle?: DutyCycle;
}
export interface FlapTick {
    readonly online: boolean;
    readonly baseProfile: NetworkProfile;
}
export interface ToxiproxyToxic {
    readonly type: 'latency' | 'bandwidth' | 'timeout' | 'slicer';
    readonly stream?: 'upstream' | 'downstream';
    readonly attributes: Readonly<Record<string, number>>;
}
export interface NetInfoSnapshot {
    readonly isConnected: boolean | null;
    readonly type: string;
    readonly details: {
        readonly isConnectionExpensive: boolean;
        readonly cellularGeneration: string | null;
    } | null;
}
export declare const NETWORK_PROFILES: Readonly<Record<NetworkProfileName, NetworkProfile>>;
export declare function toNetInfoSnapshot(profile: NetworkProfile, options?: {
    online?: boolean;
    isConnectionExpensive?: boolean;
}): NetInfoSnapshot;
export declare function flapScheduleAt(profile: NetworkProfile, elapsedMs: number): FlapTick;
export interface FetchMockShape {
    readonly preResponseDelayMs: number;
    readonly failProbability: number;
    readonly msPerKbitDown: number;
    readonly msPerKbitUp: number;
    readonly netinfo: NetInfoSnapshot;
    readonly [key: string]: unknown;
}
export interface MiddlewareDescriptor {
    readonly delayMs: number;
    readonly jitterMs: number;
    readonly failProbability: number;
    readonly sseChunkDelayMs: number;
    readonly ingressKbps: number;
    readonly [key: string]: unknown;
}
export declare function toFetchMockShape(profile: NetworkProfile): FetchMockShape;
export declare function toMiddlewareDescriptor(profile: NetworkProfile): MiddlewareDescriptor;
export declare function toToxics(profile: NetworkProfile): ToxiproxyToxic[];
