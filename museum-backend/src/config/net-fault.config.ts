// Pure env-var parser + mount predicate for the L2 network-fault injector.
//
// SECURITY-CRITICAL (Decision D3): the fault injector is a TEST-ONLY middleware
// that deliberately delays, fails, and trickles responses. It MUST be OFF in
// production UNCONDITIONALLY — there is deliberately NO escape hatch, making this
// gate STRICTER than `resolveChaosRate` (env-helpers.ts:87), which authorises a
// non-zero prod chaos rate via the `I-know-what-I-am-doing` literal. Re-introducing
// a third "escape hatch" argument here would re-open the exact prod footgun D3
// forbids, so the signature is fixed at 2-arity (raw, nodeEnv).
//
// No I/O beyond a structured stderr refusal line (mirrors the `resolveChaosRate`
// / `toIsoTimestamp` observability convention so the refusal surfaces even before
// the logger module is initialised).

import { toBoolean } from './env-helpers';

/**
 * Resolves whether the L2 network-fault injector is enabled.
 *
 * Order:
 *   1. Falsy / missing flag → false (default OFF), any env, no stderr noise.
 *   2. `nodeEnv === 'production'` AND flag truthy → coerce FALSE + emit a
 *      structured stderr refusal `{event:'net_fault_injection_refused'}`.
 *      There is NO escape hatch — production can never enable the injector.
 *   3. Otherwise (dev/test + truthy) → true.
 *
 * @param raw - The raw `NET_FAULT_INJECTION_ENABLED` env value.
 * @param nodeEnv - The resolved `NODE_ENV` ('production' | 'development' | 'test' | undefined).
 * @returns Whether the injector should be enabled.
 */
export const resolveNetFaultEnabled = (
  raw: string | undefined,
  nodeEnv: string | undefined,
): boolean => {
  const requested = toBoolean(raw, false);
  if (!requested) return false;

  if (nodeEnv === 'production') {
    // Structured stderr line — observability surfaces the refusal even if the
    // logger module is not yet initialised. NO escape hatch (D3, stricter than
    // resolveChaosRate): production can never turn the fault injector on.
    process.stderr.write(
      JSON.stringify({
        level: 'error',
        event: 'net_fault_injection_refused',
        reason: 'production_no_escape_hatch',
        raw: raw ?? '',
      }) + '\n',
    );
    return false;
  }

  return true;
};

/**
 * Mount predicate for `app.ts`. Double-guards the injector: it is mounted ONLY
 * when the process is NOT production AND the flag resolves enabled. The
 * `nodeEnv !== 'production'` clause is redundant with `resolveNetFaultEnabled`
 * (which already coerces false in prod) but is kept as defence-in-depth so a
 * future refactor of either side cannot silently mount the injector in prod.
 *
 * @param raw - The raw `NET_FAULT_INJECTION_ENABLED` env value.
 * @param nodeEnv - The resolved `NODE_ENV`.
 * @returns Whether the injector middleware should be mounted.
 */
export const shouldMountNetFault = (
  raw: string | undefined,
  nodeEnv: string | undefined,
): boolean => {
  return nodeEnv !== 'production' && resolveNetFaultEnabled(raw, nodeEnv);
};
