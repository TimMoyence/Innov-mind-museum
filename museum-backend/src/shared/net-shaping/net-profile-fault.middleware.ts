/**
 * L2 network-fault injector middleware (TEST-ONLY, Decision D3).
 *
 * SECURITY-CRITICAL: this middleware deliberately delays, fails, and trickles
 * HTTP responses to exercise the app under adverse network conditions. It is
 * mounted ONLY when `shouldMountNetFault` returns true (never in production —
 * see `@src/config/net-fault.config`). There is deliberately NO production
 * escape hatch in this module: a `git grep` for an escape-hatch token here is a
 * guarded invariant (`scripts/sentinels/net-fault-prod-guard.mjs`).
 *
 * Behaviour, driven entirely by request headers so a test client can opt in
 * per-request without server state:
 *   - No `X-Net-Profile` header → `next()` with ZERO overhead (no timer, no
 *     `res.json` patch). The vast majority of requests in a fault run target a
 *     specific profile; untagged ones must pass through untouched.
 *   - Unknown profile name → `next()` + a debug log (NOT a 400). A typo'd
 *     profile should not turn a fault-run into an error-run.
 *   - Known profile → apply a DETERMINISTIC delay (`latencyMs + jitterMs`,
 *     worst-case fixed — NOT random, so tests are reproducible) by scheduling
 *     `next()` on a timer, and EXTEND `res.setTimeout` beyond that delay so the
 *     injected latency cannot trip the default 20s socket timeout.
 *   - `X-Net-Fail-Count:N` → force the next N requests (keyed sessionId+userId+
 *     path) to fail with a REAL `serviceUnavailable()` 503 envelope, then
 *     succeed. The counter is keyed on the URL session param + auth user (NOT
 *     the request body) so a Zod-400 on a malformed body never burns the bucket.
 *   - `X-Net-Pace:1` (Mode B) → patch `res.json` to trickle the body paced by
 *     the profile's `bwDownKbps`, delivering the payload once after the trickle
 *     completes.
 *
 * lib-docs/express/PATTERNS.md §3.7 (configurable-middleware factory), §2
 * (`res.status().json`), §7 (fake req/res, next arity in tests).
 */
import { serviceUnavailable } from '@shared/errors/app.error';
import { buildPaceSchedule } from '@shared/net-shaping/chunk-pacer';
import {
  armFailureOnce,
  failureCounterKey,
  shouldFail,
} from '@shared/net-shaping/failure-counter.store';
import {
  NETWORK_PROFILES,
  toMiddlewareDescriptor,
  type NetworkProfile,
  type NetworkProfileName,
} from '@shared/net-shaping/networkProfiles';

import type { Request, Response, NextFunction, RequestHandler } from 'express';

/** Factory options — `logDebug` lets tests assert the unknown-profile debug path. */
export interface NetProfileFaultOptions {
  /** Structured debug sink (defaults to a no-op so prod-free mounts stay quiet). */
  readonly logDebug?: (event: string, context: Record<string, unknown>) => void;
}

/** Headroom added to `res.setTimeout` on top of the injected delay (ms). */
const SOCKET_TIMEOUT_HEADROOM_MS = 5_000;

/** Resolves a profile by name, or `undefined` for an unknown name. */
function resolveProfile(name: string | undefined): NetworkProfile | undefined {
  if (!name) return undefined;
  if (Object.prototype.hasOwnProperty.call(NETWORK_PROFILES, name)) {
    return NETWORK_PROFILES[name as NetworkProfileName];
  }
  return undefined;
}

/** Patches `res.json` so the body is delivered once after a bwDownKbps-paced trickle. */
function patchJsonWithTrickle(res: Response, bwDownKbps: number): void {
  const originalJson = res.json.bind(res);
  res.json = function pacedJson(payload: unknown): Response {
    const serialised = JSON.stringify(payload ?? null);
    const totalBytes = Buffer.byteLength(serialised, 'utf8');
    const schedule = buildPaceSchedule(totalBytes, bwDownKbps);
    const finalAtMs = schedule[schedule.length - 1]?.atMs ?? 0;
    // Trickle is observational pacing only; the body is delivered intact once
    // the schedule completes (a real client reassembles the streamed chunks).
    setTimeout(() => {
      originalJson(payload);
    }, finalAtMs);
    return res;
  } as Response['json'];
}

/**
 * Builds the L2 fault-injection middleware. Pure factory (no module-level state
 * beyond the shared failure-counter store).
 *
 * @param options - Optional debug sink.
 * @returns An Express request handler.
 */
export function createNetProfileFaultMiddleware(
  options: NetProfileFaultOptions = {},
): RequestHandler {
  const logDebug = options.logDebug ?? ((): void => undefined);

  return (req: Request, res: Response, next: NextFunction): void => {
    const profileName = req.header('X-Net-Profile');

    // No profile header → pass through with zero overhead.
    if (!profileName) {
      next();
      return;
    }

    const profile = resolveProfile(profileName);
    if (!profile) {
      // Unknown profile → debug + pass through (NOT a 400). A typo must not turn
      // a fault run into an error run.
      logDebug('net_fault_unknown_profile', { profile: profileName });
      next();
      return;
    }

    const descriptor = toMiddlewareDescriptor(profile);
    // Deterministic worst-case delay (latencyMs + jitterMs). NOT random so the
    // test harness can advance fake timers by an exact amount.
    const delayMs = descriptor.delayMs + descriptor.jitterMs;

    // Extend the socket timeout BEYOND the injected delay so the latency we add
    // cannot itself trip the default 20s `res.setTimeout` set upstream.
    res.setTimeout(delayMs + SOCKET_TIMEOUT_HEADROOM_MS);

    // Mode B trickle — patch res.json BEFORE the route runs so the route's
    // res.json call is paced. Scoped to the tagged request only.
    if (req.header('X-Net-Pace') === '1') {
      patchJsonWithTrickle(res, profile.bwDownKbps);
    }

    // Deterministic failure: arm the key once on first sighting, then consume.
    const failCountHeader = req.header('X-Net-Fail-Count');
    const userId = req.user?.id === undefined ? undefined : String(req.user.id);
    const sessionId = typeof req.params.id === 'string' ? req.params.id : undefined;
    const key = failureCounterKey({ sessionId, userId, path: req.path });
    if (failCountHeader !== undefined) {
      const parsed = Number.parseInt(failCountHeader, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        armFailureOnce(key, parsed);
      }
    }

    setTimeout(() => {
      if (shouldFail(key)) {
        next(
          serviceUnavailable('Injected network fault (X-Net-Fail-Count).', {
            code: 'NET_FAULT_INJECTED',
          }),
        );
        return;
      }
      next();
    }, delayMs);
  };
}
