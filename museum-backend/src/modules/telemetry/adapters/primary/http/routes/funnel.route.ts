import { type NextFunction, type Request, type Response, Router } from 'express';

import { funnelEventSchema } from '@modules/telemetry/adapters/primary/http/schemas/funnel.schemas';
import { getTelemetryPort } from '@modules/telemetry/composition/telemetry.module';
import { logger } from '@shared/logger/logger';
import { byIp, createRateLimitMiddleware } from '@shared/middleware/rate-limit.middleware';
import { validateBody } from '@shared/middleware/validate-body.middleware';

import type { FunnelEventInput } from '@modules/telemetry/adapters/primary/http/schemas/funnel.schemas';

/**
 * Wave C5 / T-C55 — `POST /api/telemetry/funnel` — BE proxy for the mobile
 * Plausible emit path (museum-frontend cannot import `next-plausible`,
 * cannot call `plausible.io` directly per PATTERNS.md §3.3).
 *
 * The route :
 *  - REQUIRES the `X-Musaium-Analytics-Consent: granted` request header —
 *    defense-in-depth GDPR Art. 7 gate. FE consent gate is primary, this
 *    header gate prevents a buggy FE refactor or a third-party caller from
 *    silently leaking funnel events. Strict string equality on `'granted'`,
 *    fail-closed otherwise (PATTERNS.md §4 item 4, TD-C5-CONSENT-HEADER-01).
 *  - validates the body with Zod (defense-in-depth — adapter also strips PII),
 *  - strips PII canaries from `props` at the HTTP boundary BEFORE forwarding
 *    to the port — defense-in-depth so a future adapter swap cannot regress
 *    GDPR (PATTERNS.md §5 anti-pattern #1, TD-C5-PROXY-TEST-01).
 *  - forwards real visitor `req.ip` + `User-Agent` to the adapter (PATTERNS.md
 *    §7 — non-negotiable for Plausible bot filter to admit the event),
 *  - returns 202 once the gate + Zod + emit succeed (fire-and-forget : the
 *    adapter is contractually non-throwing, PATTERNS.md §5 anti-pattern #10).
 *
 * Rate-limiter envelope mirrors `/api/leads/*` (5 / 600s / IP) — funnel
 * volume is naturally bounded by paywall surface impressions ; this guards
 * against malicious flooding.
 */

const telemetryRouter: Router = Router();

const funnelLimiter = createRateLimitMiddleware({
  limit: 60,
  windowMs: 600_000,
  keyGenerator: byIp,
});

const CONSENT_HEADER = 'x-musaium-analytics-consent';
const CONSENT_GRANTED_VALUE = 'granted';

/** PII canary keys defensively stripped from `props` BEFORE forwarding to the port. */
const PII_CANARY_KEYS = new Set<string>([
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
  'userId',
]);

type PropsBag = Record<string, string | number | boolean>;

/**
 * Defense-in-depth PII strip applied at the HTTP boundary BEFORE the event
 * reaches the TelemetryPort. The `PlausibleAdapter` also strips, but this
 * layer protects future port implementations (and mocks observed by tests)
 * from receiving PII. PATTERNS.md §5 anti-pattern #1.
 */
const stripPropsPii = (props: PropsBag | undefined): PropsBag | undefined => {
  if (!props) return undefined;
  const cleaned: PropsBag = {};
  for (const [key, value] of Object.entries(props)) {
    if (PII_CANARY_KEYS.has(key)) continue;
    // SEC (CodeQL js/remote-property-injection): reject prototype-polluting keys
    // before writing to the plain-object bag. Telemetry props are attacker-shaped
    // JSON, so a `__proto__`/`constructor`/`prototype` key must never reach the
    // dynamic assignment below.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    cleaned[key] = value;
  }
  return cleaned;
};

/**
 * GDPR Art. 7 defense-in-depth gate — TD-C5-CONSENT-HEADER-01. Strict string
 * equality on `'granted'` ; any other value (including `'GRANTED'`, `'true'`,
 * `'1'`, absent header) → 403. Fail-closed by design.
 */
const requireAnalyticsConsentHeader = (req: Request, res: Response, next: NextFunction): void => {
  const headerValue = req.headers[CONSENT_HEADER];
  // Express normalises duplicate header values to `string | string[] | undefined`.
  // We accept only a single literal `'granted'` — arrays and other strings fail.
  if (headerValue === CONSENT_GRANTED_VALUE) {
    next();
    return;
  }
  logger.warn('telemetry_funnel_consent_missing', {
    ip: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
    // Do NOT log the raw header value — could leak data shape ; just record
    // whether it was absent vs present-but-wrong.
    headerPresent: headerValue !== undefined,
  });
  res.status(403).json({ code: 'consent_required', error: 'consent_required' });
};

telemetryRouter.post(
  '/funnel',
  funnelLimiter,
  requireAnalyticsConsentHeader,
  validateBody(funnelEventSchema),
  async (req: Request, res: Response) => {
    const body = req.body as FunnelEventInput;
    const port = getTelemetryPort();

    // Fire-and-forget — adapter swallows errors. We `await` so synchronous
    // tests can observe the emit, but adapter is contractually non-throwing.
    await port.emit({
      name: body.name,
      url: body.url,
      domain: body.domain,
      referrer: body.referrer,
      props: stripPropsPii(body.props),
      userAgent: req.get('user-agent') ?? undefined,
      clientIp: req.ip ?? undefined,
    });

    res.status(202).json({ accepted: true });
  },
);

export default telemetryRouter;
