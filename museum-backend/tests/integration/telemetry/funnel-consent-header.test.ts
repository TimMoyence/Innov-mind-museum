/**
 * TD-C5-CONSENT-HEADER-01 RED — BE consent header gate on POST /api/telemetry/funnel.
 *
 * Pins the defense-in-depth gate called out by the Wave C5 reviewer
 * (`code-review-wave-c5.json` → finding TD-C5-CONSENT-HEADER-01) and
 * documented in `lib-docs/plausible/PATTERNS.md` §4 item 4 (Musaium consent
 * policy: BE proxy MUST verify the `X-Musaium-Analytics-Consent: granted`
 * header before forwarding to the Plausible adapter — FE consent gate is
 * primary, BE header gate is defense-in-depth).
 *
 * Without this gate, a buggy FE that forgets to consult the consent hook
 * (or a third-party caller that POSTs directly to the proxy URL) would
 * silently propagate funnel events to Plausible — a GDPR Art. 7 violation.
 *
 * Three pinned invariants :
 *
 *  1. POST `/api/telemetry/funnel` with `X-Musaium-Analytics-Consent: granted`
 *     + a body that satisfies `funnelEventSchema` → 202 + the
 *     `TelemetryPort.emit()` is called exactly ONCE with the body forwarded
 *     verbatim (modulo PII strip which is exercised in the dedicated
 *     `funnel-route-integration.test.ts`).
 *
 *  2. POST `/api/telemetry/funnel` WITHOUT the header → 403 + the
 *     `TelemetryPort.emit()` is NEVER called. The response body carries a
 *     stable error code `consent_required` so the FE can distinguish this
 *     from rate-limit (429) / Zod-fail (400) responses in its observability
 *     pipeline.
 *
 *  3. POST `/api/telemetry/funnel` with the header set to anything OTHER
 *     than the literal string `'granted'` → 403 + emit NEVER called. The
 *     gate is fail-closed : `'denied'`, `'unset'`, `'true'`, `'1'`,
 *     uppercase `'GRANTED'`, etc. all MUST be rejected. This prevents a
 *     careless FE refactor from accidentally widening the contract.
 *
 * RED state — at HEAD `52a270864` the consent gate is NOT implemented :
 *  - `museum-backend/src/modules/telemetry/adapters/primary/http/routes/funnel.route.ts`
 *    validates the body via `validateBody(funnelEventSchema)` then immediately
 *    calls `port.emit(...)` and returns 202 — there is no header check
 *    anywhere in the handler chain (verified by Read at HEAD).
 *  - Tests T-2 and T-3 below currently PASS the "happy path 202" assertions
 *    (the handler already returns 202 for valid bodies) but FAIL the
 *    "missing header → 403" and "wrong header → 403" assertions because the
 *    handler accepts every request that survives Zod.
 *
 * Frozen-test invariant (UFR-022 phase red) : this file is immutable
 * byte-for-byte once committed. Green that suspects a test is wrong MUST
 * emit `BLOCK-TEST-WRONG <path>:<line> <reason>` and let the dispatcher
 * re-spawn a fresh red phase. NEVER edit this file from a green/reviewer
 * phase.
 *
 * Scoped run :
 *   cd museum-backend && pnpm exec jest --watchman=false --runInBand \
 *     --selectProjects unit-integration --coverage=false \
 *     --testPathPattern=funnel-consent-header
 */

import request from 'supertest';

import { createApp } from '@src/app';
import { setTelemetryPort } from '@modules/telemetry/composition/telemetry.module';
import { resetRateLimits, stopRateLimitSweep } from 'tests/helpers/http/route-test-setup';

import type { TelemetryEvent, TelemetryPort } from '@modules/telemetry/domain/telemetry.port';

// ── Stub TelemetryPort ───────────────────────────────────────────────────────
//
// We register a stub port via `setTelemetryPort` (existing composition-root
// seam consumed by `funnel-quota-exceeded.test.ts`) so the assertions
// observe emit() invocations deterministically without booting the
// PlausibleAdapter or doing live HTTP to plausible.io.

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

  // ── Invariant 1 — header granted + valid body → 202 + emit once ─────────

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
    // The handler MUST forward the body name verbatim — the consent gate is
    // a pre-filter, not a body transformer.
    expect(eventArg?.name).toBe('paywall_modal_shown');
  });

  // ── Invariant 2 — header absent → 403 + emit NEVER called ───────────────

  it('header absent → 403 consent_required + emit NEVER called', async () => {
    const res = await request(app)
      .post('/api/telemetry/funnel')
      .set('User-Agent', 'MusaiumMobile/1.0 (consent-header-test)')
      .set('X-Forwarded-For', '203.0.113.10')
      .send(validBody());

    expect(res.status).toBe(403);
    // Stable error code so the FE can distinguish consent-required from
    // rate-limit (429) and Zod-fail (400). Body may also carry a human
    // message; the canonical signal is the `code` field (or `error`,
    // matching the route comment).
    const body = res.body as { code?: string; error?: string };
    const codeOrError = body.code ?? body.error;
    expect(codeOrError).toBe('consent_required');

    // CRITICAL — the emit MUST NOT have fired (the whole point of the gate).
    expect(emit).not.toHaveBeenCalled();
  });

  // ── Invariant 3 — non-"granted" header values → 403 + emit NEVER called ─

  it('header set to a non-"granted" value → 403 + emit NEVER called (fail-closed)', async () => {
    // Each adversarial value is sent on a fresh request. The gate is strict
    // string equality on the literal `'granted'`. Anything else fails closed.
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
