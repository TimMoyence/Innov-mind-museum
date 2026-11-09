import { type NextFunction, type Request, type Response, Router } from 'express';

import { funnelEventSchema } from '@modules/telemetry/adapters/primary/http/schemas/funnel.schemas';
import { getTelemetryPort } from '@modules/telemetry/composition/telemetry.module';
import { logger } from '@shared/logger/logger';
import { byIp, createRateLimitMiddleware } from '@shared/middleware/rate-limit.middleware';
import { validateBody } from '@shared/middleware/validate-body.middleware';

import type { FunnelEventInput } from '@modules/telemetry/adapters/primary/http/schemas/funnel.schemas';

const telemetryRouter: Router = Router();

const funnelLimiter = createRateLimitMiddleware({
  limit: 60,
  windowMs: 600_000,
  keyGenerator: byIp,
});

const CONSENT_HEADER = 'x-musaium-analytics-consent';
const CONSENT_GRANTED_VALUE = 'granted';

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

const stripPropsPii = (props: PropsBag | undefined): PropsBag | undefined => {
  if (!props) return undefined;
  return Object.fromEntries(
    Object.entries(props).filter(
      ([key]) =>
        !PII_CANARY_KEYS.has(key) &&
        key !== '__proto__' &&
        key !== 'constructor' &&
        key !== 'prototype',
    ),
  );
};

const requireAnalyticsConsentHeader = (req: Request, res: Response, next: NextFunction): void => {
  const headerValue = req.headers[CONSENT_HEADER];
  if (headerValue === CONSENT_GRANTED_VALUE) {
    next();
    return;
  }
  logger.warn('telemetry_funnel_consent_missing', {
    ip: req.ip,
    userAgent: req.get('user-agent') ?? undefined,
    headerPresent: headerValue !== undefined,
  });
  res.status(403).json({ code: 'consent_required', error: 'consent_required' });
};

telemetryRouter.post(
  '/funnel',
  requireAnalyticsConsentHeader,
  validateBody(funnelEventSchema),
  funnelLimiter,
  async (req: Request, res: Response) => {
    const body = req.body as FunnelEventInput;
    const port = getTelemetryPort();

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
