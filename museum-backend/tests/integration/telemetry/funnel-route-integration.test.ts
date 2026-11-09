import request from 'supertest';

import { createApp } from '@src/app';
import { setTelemetryPort } from '@modules/telemetry/composition/telemetry.module';
import { resetRateLimits, stopRateLimitSweep } from 'tests/helpers/http/route-test-setup';

import type { TelemetryEvent, TelemetryPort } from '@modules/telemetry/domain/telemetry.port';

const emit = jest.fn<Promise<void>, [TelemetryEvent]>();
const stubPort: TelemetryPort = { emit };

const app = createApp({
  healthCheck: async () => ({ database: 'up' }),
});

const validBody = (): Record<string, unknown> => ({
  name: 'paywall_modal_shown',
  url: 'app://musaium/mobile',
  domain: 'musaium.test',
  props: { tier: 'free' },
});

describe('TD-C5-PROXY-TEST-01 — POST /api/telemetry/funnel direct integration', () => {
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

  it('valid body + consent granted → 202 + emit called exactly once with mirrored fields', async () => {
    const res = await request(app)
      .post('/api/telemetry/funnel')
      .set('User-Agent', 'MusaiumMobile/1.0 (proxy-integration-test)')
      .set('X-Forwarded-For', '203.0.113.20')
      .set('X-Musaium-Analytics-Consent', 'granted')
      .send(validBody());

    expect(res.status).toBe(202);

    expect(emit).toHaveBeenCalledTimes(1);

    const eventArg = emit.mock.calls[0]?.[0];
    expect(eventArg).toBeDefined();
    expect(eventArg).toEqual(
      expect.objectContaining({
        name: 'paywall_modal_shown',
        url: 'app://musaium/mobile',
        domain: 'musaium.test',
        props: expect.objectContaining({ tier: 'free' }),
      }),
    );
  });

  it('body missing required `name` → 400 + emit NEVER called (Zod short-circuit)', async () => {
    const malformed = { url: 'app://musaium/mobile', domain: 'musaium.test' };

    const res = await request(app)
      .post('/api/telemetry/funnel')
      .set('User-Agent', 'MusaiumMobile/1.0 (proxy-integration-test)')
      .set('X-Forwarded-For', '203.0.113.20')
      .set('X-Musaium-Analytics-Consent', 'granted')
      .send(malformed);

    expect(res.status).toBe(400);

    expect(emit).not.toHaveBeenCalled();
  });

  it('props.email supplied → 202 + emit called once + emitted event MUST NOT carry email', async () => {
    const bodyWithPii: Record<string, unknown> = {
      name: 'paywall_email_captured',
      url: 'app://musaium/mobile',
      domain: 'musaium.test',
      props: {
        tier: 'free',
        email: 'leak@example.test',
      },
    };

    const res = await request(app)
      .post('/api/telemetry/funnel')
      .set('User-Agent', 'MusaiumMobile/1.0 (proxy-integration-test)')
      .set('X-Forwarded-For', '203.0.113.20')
      .set('X-Musaium-Analytics-Consent', 'granted')
      .send(bodyWithPii);

    expect(res.status).toBe(202);
    expect(emit).toHaveBeenCalledTimes(1);

    const eventArg = emit.mock.calls[0]?.[0];
    expect(eventArg).toBeDefined();
    expect(eventArg?.props).toBeDefined();
    expect(eventArg?.props).not.toHaveProperty('email');
    expect(eventArg?.props).toEqual(expect.objectContaining({ tier: 'free' }));
  });
});
