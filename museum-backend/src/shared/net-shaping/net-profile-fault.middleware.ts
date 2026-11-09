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

export interface NetProfileFaultOptions {
  readonly logDebug?: (event: string, context: Record<string, unknown>) => void;
}

const SOCKET_TIMEOUT_HEADROOM_MS = 5_000;

function resolveProfile(name: string | undefined): NetworkProfile | undefined {
  if (!name) return undefined;
  if (Object.prototype.hasOwnProperty.call(NETWORK_PROFILES, name)) {
    return NETWORK_PROFILES[name as NetworkProfileName];
  }
  return undefined;
}

function patchJsonWithTrickle(res: Response, bwDownKbps: number): void {
  const originalJson = res.json.bind(res);
  res.json = function pacedJson(payload: unknown): Response {
    const serialised = JSON.stringify(payload ?? null);
    const totalBytes = Buffer.byteLength(serialised, 'utf8');
    const schedule = buildPaceSchedule(totalBytes, bwDownKbps);
    const finalAtMs = schedule[schedule.length - 1]?.atMs ?? 0;
    setTimeout(() => {
      originalJson(payload);
    }, finalAtMs);
    return res;
  } as Response['json'];
}

export function createNetProfileFaultMiddleware(
  options: NetProfileFaultOptions = {},
): RequestHandler {
  const logDebug = options.logDebug ?? ((): void => undefined);

  return (req: Request, res: Response, next: NextFunction): void => {
    const profileName = req.header('X-Net-Profile');

    if (!profileName) {
      next();
      return;
    }

    const profile = resolveProfile(profileName);
    if (!profile) {
      logDebug('net_fault_unknown_profile', { profile: profileName });
      next();
      return;
    }

    const descriptor = toMiddlewareDescriptor(profile);
    const delayMs = descriptor.delayMs + descriptor.jitterMs;

    res.setTimeout(delayMs + SOCKET_TIMEOUT_HEADROOM_MS);

    if (req.header('X-Net-Pace') === '1') {
      patchJsonWithTrickle(res, profile.bwDownKbps);
    }

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
