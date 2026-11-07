"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NETWORK_PROFILES = void 0;
exports.toNetInfoSnapshot = toNetInfoSnapshot;
exports.flapScheduleAt = flapScheduleAt;
exports.toFetchMockShape = toFetchMockShape;
exports.toMiddlewareDescriptor = toMiddlewareDescriptor;
exports.toToxics = toToxics;
exports.NETWORK_PROFILES = Object.freeze({
    offline: Object.freeze({
        name: 'offline',
        label: 'Offline (no connectivity)',
        latencyMs: 0,
        jitterMs: 0,
        bwDownKbps: 0,
        bwUpKbps: 0,
        lossPct: 1,
        netinfoType: 'none',
        cellularGeneration: null,
        expectedDataMode: 'low',
        metered: false,
        expectedQuality: null,
    }),
    '2g': Object.freeze({
        name: '2g',
        label: '2G (slow cellular)',
        latencyMs: 350,
        jitterMs: 150,
        bwDownKbps: 100,
        bwUpKbps: 40,
        lossPct: 0.02,
        netinfoType: 'cellular',
        cellularGeneration: '2g',
        expectedDataMode: 'low',
        metered: true,
        expectedQuality: 'ok',
    }),
    edge: Object.freeze({
        name: 'edge',
        label: 'EDGE (2.5G)',
        latencyMs: 200,
        jitterMs: 120,
        bwDownKbps: 200,
        bwUpKbps: 90,
        lossPct: 0.01,
        netinfoType: 'cellular',
        cellularGeneration: '2g',
        expectedDataMode: 'low',
        metered: true,
        expectedQuality: 'ok',
    }),
    '3g-lossy': Object.freeze({
        name: '3g-lossy',
        label: '3G (lossy)',
        latencyMs: 120,
        jitterMs: 80,
        bwDownKbps: 700,
        bwUpKbps: 300,
        lossPct: 0.08,
        netinfoType: 'cellular',
        cellularGeneration: '3g',
        expectedDataMode: 'low',
        metered: true,
        expectedQuality: 'ok',
    }),
    flapping: Object.freeze({
        name: 'flapping',
        label: 'Flapping (on/off cellular)',
        latencyMs: 120,
        jitterMs: 80,
        bwDownKbps: 700,
        bwUpKbps: 300,
        lossPct: 0.08,
        netinfoType: 'cellular',
        cellularGeneration: '3g',
        expectedDataMode: 'low',
        metered: true,
        expectedQuality: 'ok',
        dutyCycle: Object.freeze({
            onlineMs: 5000,
            offlineMs: 3000,
            baseProfile: '3g-lossy',
        }),
    }),
    normal: Object.freeze({
        name: 'normal',
        label: 'Normal (wifi / control)',
        latencyMs: 25,
        jitterMs: 10,
        bwDownKbps: 20000,
        bwUpKbps: 8000,
        lossPct: 0,
        netinfoType: 'wifi',
        cellularGeneration: null,
        expectedDataMode: 'normal',
        metered: false,
        expectedQuality: 'ok',
    }),
    '4g': Object.freeze({
        name: '4g',
        label: '4G (healthy cellular)',
        latencyMs: 175,
        jitterMs: 50,
        bwDownKbps: 1600,
        bwUpKbps: 700,
        lossPct: 0,
        netinfoType: 'cellular',
        cellularGeneration: '4g',
        expectedDataMode: 'normal',
        metered: true,
        expectedQuality: 'ok',
    }),
    '5g': Object.freeze({
        name: '5g',
        label: '5G (healthy cellular)',
        latencyMs: 60,
        jitterMs: 20,
        bwDownKbps: 10000,
        bwUpKbps: 5000,
        lossPct: 0,
        netinfoType: 'cellular',
        cellularGeneration: '5g',
        expectedDataMode: 'normal',
        metered: true,
        expectedQuality: 'ok',
    }),
    'wifi-metered': Object.freeze({
        name: 'wifi-metered',
        label: 'WiFi (metered hotspot)',
        latencyMs: 80,
        jitterMs: 30,
        bwDownKbps: 5000,
        bwUpKbps: 2000,
        lossPct: 0,
        netinfoType: 'wifi',
        cellularGeneration: null,
        expectedDataMode: 'normal',
        metered: true,
        expectedQuality: 'ok',
    }),
    'cellular-degraded': Object.freeze({
        name: 'cellular-degraded',
        label: 'Cellular degraded (5G one-bar basement)',
        latencyMs: 1800,
        jitterMs: 600,
        bwDownKbps: 75,
        bwUpKbps: 30,
        lossPct: 0.3,
        netinfoType: 'cellular',
        cellularGeneration: '4g',
        expectedDataMode: 'normal',
        metered: true,
        expectedQuality: 'slow',
    }),
});
function toNetInfoSnapshot(profile, options) {
    const defaultOnline = profile.netinfoType !== 'none';
    const online = options?.online ?? defaultOnline;
    if (!online) {
        return {
            isConnected: false,
            type: 'none',
            details: {
                isConnectionExpensive: false,
                cellularGeneration: null,
            },
        };
    }
    return {
        isConnected: true,
        type: profile.netinfoType,
        details: {
            isConnectionExpensive: options?.isConnectionExpensive ?? profile.metered,
            cellularGeneration: profile.cellularGeneration,
        },
    };
}
function flapScheduleAt(profile, elapsedMs) {
    const cycle = profile.dutyCycle;
    if (cycle === undefined) {
        throw new Error(`flapScheduleAt: profile "${profile.name}" has no dutyCycle (not a flapping profile)`);
    }
    const period = cycle.onlineMs + cycle.offlineMs;
    const phase = ((elapsedMs % period) + period) % period;
    const online = phase < cycle.onlineMs;
    return {
        online,
        baseProfile: exports.NETWORK_PROFILES[cycle.baseProfile],
    };
}
function kbpsToKBytesPerSec(kbps) {
    return kbps === 0 ? 0 : Math.max(1, Math.round(kbps / 8));
}
function msPerKbit(bwKbps) {
    return bwKbps === 0 ? Number.POSITIVE_INFINITY : 1000 / bwKbps;
}
function toFetchMockShape(profile) {
    return {
        preResponseDelayMs: profile.latencyMs,
        failProbability: profile.lossPct,
        msPerKbitDown: msPerKbit(profile.bwDownKbps),
        msPerKbitUp: msPerKbit(profile.bwUpKbps),
        netinfo: toNetInfoSnapshot(profile),
    };
}
function toMiddlewareDescriptor(profile) {
    const sseChunkDelayMs = Math.round(msPerKbit(profile.bwDownKbps) * 1000);
    return {
        delayMs: profile.latencyMs,
        jitterMs: profile.jitterMs,
        failProbability: profile.lossPct,
        sseChunkDelayMs,
        ingressKbps: profile.bwUpKbps,
    };
}
function toToxics(profile) {
    const toxics = [
        {
            type: 'latency',
            attributes: { latency: profile.latencyMs, jitter: profile.jitterMs },
        },
        {
            type: 'bandwidth',
            stream: 'upstream',
            attributes: { rate: kbpsToKBytesPerSec(profile.bwUpKbps) },
        },
        {
            type: 'bandwidth',
            stream: 'downstream',
            attributes: { rate: kbpsToKBytesPerSec(profile.bwDownKbps) },
        },
    ];
    return toxics;
}
