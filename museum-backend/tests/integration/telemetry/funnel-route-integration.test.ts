/**
 * TD-C5-PROXY-TEST-01 RED — Direct integration coverage of POST /api/telemetry/funnel.
 *
 * Pins the gap called out by the Wave C5 reviewer (`code-review-wave-c5.json`
 * → finding TD-C5-PROXY-TEST-01) : `funnel-quota-exceeded.test.ts` exercises
 * the route TRANSITIVELY (via the chat-quota middleware emitting through the
 * same TelemetryPort), but no test hits `POST /api/telemetry/funnel` directly
 * to validate Zod fail paths, emit count, and the PII-strip contract at the
 * HTTP boundary.
 *
 * Lib-docs consulted : `lib-docs/plausible/PATTERNS.md` §2 (Events API body
 * params name/url/domain required, props ≤30 keys, scalar values) + §3.3
 * (BE proxy at `/api/telemetry/funnel`) + §5 (no PII in props — anti-pattern
 * #1) + §7 (User-Agent + X-Forwarded-For non-negotiable for the bot filter).
 *
 * Three pinned invariants (overlap with funnel-consent-header.test.ts is
 * minimal — that file focuses on the consent header value matrix ; this
 * file focuses on the Zod / emit-count / PII-strip contract once consent
 * has been granted) :
 *
 *  1. Valid body + consent header → 202 + the stub `TelemetryPort.emit()`
 *     is called EXACTLY ONCE with `{name, url, domain, props}` mirroring the
 *     body. The "exactly once" assertion is load-bearing : a careless
 *     refactor that re-runs the handler chain (e.g. wraps the route in a
 *     retry middleware) would inflate the funnel count and break the
 *     Plausible dashboard's per-impression numerator.
 *
 *  2. Body that fails `funnelEventSchema` (missing required `name`) →
 *     400 + emit NEVER called. Confirms the Zod validator short-circuits
 *     BEFORE the emit call (defensive ordering — emit is fire-and-forget so
 *     a bug here would silently send malformed events to Plausible, which
 *     would be silently dropped per PATTERNS.md §6).
 *
 *  3. Valid body with a `props.email` PII canary → 202 + emit called once,
 *     BUT the event passed to emit MUST NOT contain `email` in `props`.
 *     This pins the PII-strip contract at the HTTP boundary (`PlausibleAdapter`
 *     also strips, but a thin route-level strip is defense-in-depth so a
 *     hypothetical future swap of the adapter does not regress GDPR).
 *
 * RED state — at HEAD `52a270864` :
 *  - The consent header gate is absent (cf. funnel-consent-header.test.ts),
 *    so invariant 1 currently FAILS at the "header granted → 202" step
 *    (passes today because no gate exists ; will continue passing once
 *    green ships the gate). The "exactly once" emit assertion is the load-
 *    bearing pin here.
 *  - Invariant 2 (Zod fail → 400 + no emit) PASSES at HEAD (validateBody
 *    short-circuits already) — kept as a regression anchor.
 *  - Invariant 3 (`props.email` strip) PASSES at HEAD because the secondary
 *    `PlausibleAdapter` strips PII — but the assertion runs against the stub
 *    port BEFORE it reaches the adapter, so it currently FAILS : the route
 *    handler forwards `props` verbatim to `port.emit()` without stripping.
 *    Green must either strip in the route OR refactor the strip into a
 *    shared helper consumed by both the route and the adapter.
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
 *     --testPathPattern=funnel-route-integration
 */

import request from 'supertest';

import { createApp } from '@src/app';
import { setTelemetryPort } from '@modules/telemetry/composition/telemetry.module';
import { resetRateLimits, stopRateLimitSweep } from 'tests/helpers/http/route-test-setup';

import type { TelemetryEvent, TelemetryPort } from '@modules/telemetry/domain/telemetry.port';

// ── Stub TelemetryPort ───────────────────────────────────────────────────────

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

  // ── Invariant 1 — happy path : 202 + emit called exactly once ───────────

  it('valid body + consent granted → 202 + emit called exactly once with mirrored fields', async () => {
    const res = await request(app)
      .post('/api/telemetry/funnel')
      .set('User-Agent', 'MusaiumMobile/1.0 (proxy-integration-test)')
      .set('X-Forwarded-For', '203.0.113.20')
      .set('X-Musaium-Analytics-Consent', 'granted')
      .send(validBody());

    expect(res.status).toBe(202);

    // Load-bearing pin — exactly ONE emit, no inflation.
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

  // ── Invariant 2 — Zod fail (missing name) → 400 + emit NEVER called ────

  it('body missing required `name` → 400 + emit NEVER called (Zod short-circuit)', async () => {
    const malformed = { url: 'app://musaium/mobile', domain: 'musaium.test' };

    const res = await request(app)
      .post('/api/telemetry/funnel')
      .set('User-Agent', 'MusaiumMobile/1.0 (proxy-integration-test)')
      .set('X-Forwarded-For', '203.0.113.20')
      .set('X-Musaium-Analytics-Consent', 'granted')
      .send(malformed);

    expect(res.status).toBe(400);

    // Defense-in-depth — the Zod validator MUST run before the emit, so a
    // malformed body never reaches the Plausible adapter (silent drop per
    // PATTERNS.md §6 would mask the FE bug).
    expect(emit).not.toHaveBeenCalled();
  });

  // ── Invariant 3 — props.email stripped before emit (PII defense) ────────

  it('props.email supplied → 202 + emit called once + emitted event MUST NOT carry email', async () => {
    const bodyWithPii: Record<string, unknown> = {
      name: 'paywall_email_captured',
      url: 'app://musaium/mobile',
      domain: 'musaium.test',
      props: {
        tier: 'free',
        // Adversarial caller — value MUST never reach the adapter.
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
    // PATTERNS.md §5 anti-pattern #1 — email is the canary PII key.
    expect(eventArg?.props).not.toHaveProperty('email');
    // Non-PII prop survives.
    expect(eventArg?.props).toEqual(expect.objectContaining({ tier: 'free' }));
  });
});
