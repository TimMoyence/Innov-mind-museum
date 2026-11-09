import { logger } from '@shared/logger/logger';

import type { TelemetryEvent, TelemetryPort } from '@modules/telemetry/domain/telemetry.port';

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

type PropValue = string | number | boolean;
type PropsBag = Record<string, PropValue>;

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
    if (!this.endpoint) return;
    const domain = event.domain || this.defaultDomain;
    if (!domain) return;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
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

      if (res.headers.get('x-plausible-dropped') === '1') {
        logger.warn('plausible_event_dropped', {
          name: event.name,
          domain,
        });
      }
    } catch (err) {
      logger.warn('plausible_emit_failed', {
        name: event.name,
        domain,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }
}
