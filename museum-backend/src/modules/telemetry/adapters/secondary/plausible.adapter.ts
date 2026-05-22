import { logger } from '@shared/logger/logger';

import type { TelemetryEvent, TelemetryPort } from '@modules/telemetry/domain/telemetry.port';

/**
 * Wave C5 / T-C55 — Plausible HTTP adapter for `TelemetryPort`.
 *
 * Lib-docs reference : `lib-docs/plausible/PATTERNS.md` §3.2 + §2 (canonical
 * POST `/api/event` shape) + §7 (`X-Forwarded-For` non-negotiable, bot filter
 * silently drops events without a real visitor IP) + §5 (no PII in props,
 * never throw from adapter).
 *
 * No-op fallback when `endpoint` (or `domain`) is undefined → green in dev
 * environments without a Plausible site. Production validation (env loader)
 * is responsible for enforcing presence in `production` NODE_ENV.
 */

/** PII canary keys defensively stripped from `props` before forwarding. */
const PII_CANARY_KEYS = new Set([
  'email',
  'userEmail',
  'phone',
  'phoneNumber',
  'fullName',
  'firstName',
  'lastName',
  'address',
  'birthdate',
  'dateOfBirth',
]);

/** Scalar prop value — Plausible silently drops nested objects (PATTERNS.md §2). */
type PropValue = string | number | boolean;
type PropsBag = Record<string, PropValue>;

/** Strip PII canaries from props (PATTERNS.md §5 anti-pattern #1, defense-in-depth). */
const stripPii = (props: PropsBag | undefined): PropsBag | undefined => {
  if (!props) return undefined;
  const cleaned: PropsBag = {};
  for (const [key, value] of Object.entries(props)) {
    if (PII_CANARY_KEYS.has(key)) continue;
    cleaned[key] = value;
  }
  return cleaned;
};

export class PlausibleAdapter implements TelemetryPort {
  constructor(
    private readonly endpoint: string | undefined,
    private readonly defaultDomain: string | undefined,
  ) {}

  async emit(event: TelemetryEvent): Promise<void> {
    // No-op when Plausible isn't configured — keeps dev / test cheap and
    // prevents accidental cross-environment reporting (PATTERNS.md §5 :
    // "DON'T hardcode `data-domain` / `domain` in source").
    if (!this.endpoint) return;
    const domain = event.domain || this.defaultDomain;
    if (!domain) return;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    // PATTERNS.md §2 + §5 + §7 — both User-Agent and X-Forwarded-For are
    // load-bearing for daily-hash visitor identification + bot-filter bypass.
    if (event.userAgent) headers['User-Agent'] = event.userAgent;
    if (event.clientIp) headers['X-Forwarded-For'] = event.clientIp;

    const body = JSON.stringify({
      name: event.name,
      url: event.url,
      domain,
      referrer: event.referrer,
      props: stripPii(event.props),
    });

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers,
        body,
      });

      // PATTERNS.md §6 + §2 — HTTP 202 is unconditional ; only the
      // `x-plausible-dropped` response header signals a silent drop.
      if (res.headers.get('x-plausible-dropped') === '1') {
        logger.warn('plausible_event_dropped', {
          name: event.name,
          domain,
        });
      }
    } catch (err) {
      // PATTERNS.md §5 anti-pattern : adapter MUST never throw. Log + swallow.
      logger.warn('plausible_emit_failed', {
        name: event.name,
        domain,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }
}
