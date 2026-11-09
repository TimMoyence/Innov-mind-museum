import request from 'supertest';

import { createApp } from '@src/app';
import { setTelemetryPort } from '@modules/telemetry/composition/telemetry.module';
import { resetRateLimits, stopRateLimitSweep } from 'tests/helpers/http/route-test-setup';

import type { TelemetryEvent, TelemetryPort } from '@modules/telemetry/domain/telemetry.port';

const emit = jest.fn<Promise<void>, [TelemetryEvent]>();
const stubPort: TelemetryPort = { emit };

const validBody = (): Record<string, unknown> => ({
  name: 'paywall_modal_shown',
  url: 'app://musaium/mobile',
  domain: 'musaium.test',
  props: { tier: 'free' },
});

const app = createApp({
  healthCheck: async () => ({ database: 'up' }),
});

describe('TD-C5-CONSENT-HEADER-01 — POST /api/telemetry/funnel consent header gate', () => {
  beforeEach(() => {
    resetRateLimits();
    emit.mockReset();
    emit.mockResolvedValue();
    setTelemetryPort(stubPort);
  });

  afterEach(() => {
    setTelemetryPort(null);
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('header "granted" + valid body → 202 accepted + emit called exactly once', async () => {
    const res = await request(app)
      .post('/api/telemetry/funnel')
      .set('User-Agent', 'MusaiumMobile/1.0 (consent-header-test)')
      .set('X-Forwarded-For', '203.0.113.10')
      .set('X-Musaium-Analytics-Consent', 'granted')
      .send(validBody());

    expect(res.status).toBe(202);
    expect(emit).toHaveBeenCalledTimes(1);

    const eventArg = emit.mock.calls[0]?.[0];
    expect(eventArg).toBeDefined();
    expect(eventArg?.name).toBe('paywall_modal_shown');
  });

  it('header absent → 403 consent_required + emit NEVER called', async () => {
    const res = await request(app)
      .post('/api/telemetry/funnel')
      .set('User-Agent', 'MusaiumMobile/1.0 (consent-header-test)')
      .set('X-Forwarded-For', '203.0.113.10')
      .send(validBody());

    expect(res.status).toBe(403);
    const body = res.body as { code?: string; error?: string };
    const codeOrError = body.code ?? body.error;
    expect(codeOrError).toBe('consent_required');

    expect(emit).not.toHaveBeenCalled();
  });

  it('header set to a non-"granted" value → 403 + emit NEVER called (fail-closed)', async () => {
    const failClosedValues = ['denied', 'unset', 'true', '1', 'GRANTED', 'Granted', ''];

    for (const value of failClosedValues) {
      emit.mockClear();

      const res = await request(app)
        .post('/api/telemetry/funnel')
        .set('User-Agent', 'MusaiumMobile/1.0 (consent-header-test)')
        .set('X-Forwarded-For', '203.0.113.10')
        .set('X-Musaium-Analytics-Consent', value)
        .send(validBody());

      expect(res.status).toBe(403);
      expect(emit).not.toHaveBeenCalled();
    }
  });
});
