/**
 * Wave C5 / T-C53 — RED integration test for BE quota-exceeded → Plausible.
 *
 * Pins spec.md §R-C5 (event `quota_exceeded` MUST be emitted by the BE when
 * the chat quota gate fires) + design.md D7 (BE telemetry hexagonal port,
 * adapter = Plausible HTTP POST) + decisions.md D-C5 (Plausible cookieless +
 * consent gate centralised BE-side) down BEFORE implementation.
 *
 * Lib-docs consulted : `lib-docs/plausible/PATTERNS.md` §3.2 (hexagonal
 * `TelemetryPort` + `PlausibleAdapter` + adapter `emit({name, url, domain,
 * userAgent, clientIp, props})`), §2 (POST /api/event canonical contract :
 * `User-Agent` required, `X-Forwarded-For` required for BE/proxy callers,
 * `Content-Type: application/json`), §5 anti-patterns (DON'T omit
 * `X-Forwarded-For` ; DON'T put PII into `props` ; DON'T throw from adapter),
 * §7 (`X-Forwarded-For` non-negotiable — silent drop otherwise), §8 (testing :
 * unit-test the adapter by mocking fetch, asserting headers + body shape).
 *
 * Quota gate ground truth (verified at HEAD `89d2d7b44`) :
 *  - Route mount : `POST /api/chat/sessions` (api.router.ts:355 mounts
 *    `createChatRouter` under `/chat` ; chat.route.ts:44 mounts
 *    `createSessionRouter` under `/`; chat-session.route.ts:109-126 declares
 *    `POST /sessions` with middleware chain `isAuthenticated →
 *    validateBody(createSessionSchema) → monthlySessionQuota`).
 *  - Quota middleware : `monthly-session-quota.middleware.ts:103-127` — when
 *    `repo.tryConsume()` returns null, responds with HTTP **402** (NOT 429 —
 *    N15 spec invariant) and body
 *    `{ code: 'QUOTA_EXCEEDED', tier, currentCount, limit, resetAt, message }`.
 *  - The brief mentions "429 ou 403" but the verified route emits 402. We
 *    assert on 402 + body.code='QUOTA_EXCEEDED' as the load-bearing signal
 *    (UFR-013 : cite the verified contract, not the brief approximation).
 *
 * Two pinned invariants :
 *
 *  1. Quota gate fires (free-tier user already at limit) → response 402 with
 *     `code: 'QUOTA_EXCEEDED'`. This is the regression anchor : C5 MUST NOT
 *     change the HTTP contract that mobile axios interceptor R8/R24 pins.
 *
 *  2. **The SAME request** MUST emit exactly 1 telemetry event with `name:
 *     'quota_exceeded'` to the `TelemetryPort` (mocked PlausibleAdapter
 *     `emit()`). The event body MUST carry `domain`, `url`, and a `props`
 *     object that includes `tier: 'free'` and `limit: <number>` (so the
 *     dashboard funnel can segment by tier). The body MUST NOT include the
 *     user's email or any PII (PATTERNS.md §5 anti-pattern #1).
 *
 * RED state — at HEAD `89d2d7b44` :
 *  - `museum-backend/src/modules/telemetry/` does NOT exist (verified via
 *    `find museum-backend/src/modules -type d -name telemetry` → empty).
 *  - No `setTelemetryPort` symbol, no `TelemetryPort` interface, no
 *    `PlausibleAdapter` class anywhere in `museum-backend/src/`.
 *  - The quota middleware emits a structured `logger.info('quota_check_hit_limit')`
 *    log only ; there is NO funnel-event emission.
 *
 * The test FAILS in two compounding ways at HEAD :
 *  (a) `import { setTelemetryPort } from '@modules/telemetry/...'` throws
 *      "Cannot find module" → suite errors at load.
 *  (b) Even with a stub TelemetryPort registered, the quota middleware would
 *      not call it (no integration in `monthlySessionQuota` yet) → the
 *      `expect(emit).toHaveBeenCalled...` assertions would fail in green
 *      phase if the wiring is forgotten.
 *
 * Frozen-test invariant (UFR-022 phase red) : this file is immutable
 * byte-for-byte once committed. A green agent that suspects a test is wrong
 * MUST emit `BLOCK-TEST-WRONG <path>:<line> <reason>` and let the dispatcher
 * re-spawn a fresh red phase. NEVER edit this file from a green/reviewer
 * phase.
 *
 * Pattern reference : the in-process supertest harness mirrors
 * `tests/unit/routes/chat-session-quota-ordering.test.ts` (F1) — `createApp`
 * + stub `MonthlyQuotaRepo` via `setMonthlyQuotaRepo` to force the 402
 * deterministically without booting a Postgres testcontainer. This is the
 * cheapest test that observes the middleware ↔ telemetry wiring.
 *
 * Scoped run :
 *   cd museum-backend && pnpm test --testPathPattern=funnel-quota-exceeded \
 *     --no-coverage --runInBand
 */

import request from 'supertest';

import { createApp } from '@src/app';
import {
  setMonthlyQuotaRepo,
  type MonthlyQuotaRepo,
} from '@shared/middleware/monthly-session-quota.middleware';
import { makeToken } from 'tests/helpers/auth/token.helpers';
import { resetRateLimits, stopRateLimitSweep } from 'tests/helpers/http/route-test-setup';

// SUT — module does NOT exist at HEAD. Import failure IS one of the two RED
// signals. The green phase (T-C55) MUST create this module surface.
//
// The import is intentionally a `require()` inside the test so that the
// suite produces a deterministic assertion failure rather than a Jest module-
// resolution error. The first `describe` block asserts on the import outcome
// itself, making the RED signal load-bearing AND test-visible.
//
// Expected green surface (PATTERNS.md §3.2) :
//   export interface TelemetryEvent { name; url; domain; userAgent?; clientIp?;
//                                     props?; revenue?; referrer? }
//   export interface TelemetryPort { emit(e: TelemetryEvent): Promise<void> }
//   export function setTelemetryPort(p: TelemetryPort | null): void

import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';

// Stub ChatService — createSession should never be invoked when the quota
// gate fires (the 402 short-circuits the route handler). We assert this is
// the case as a third defensive invariant.
const mockCreateSession = jest.fn();
const mockChatService: Partial<ChatService> = {
  createSession: mockCreateSession,
  listSessions: jest.fn(),
  getSession: jest.fn(),
  deleteSessionIfEmpty: jest.fn(),
  postMessage: jest.fn(),
  reportMessage: jest.fn(),
  getMessageImageRef: jest.fn(),
  setMessageFeedback: jest.fn(),
};

const app = createApp({
  chatService: mockChatService as ChatService,
  healthCheck: async () => ({ database: 'up' }),
});

const firstOfThisUtcMonth = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};

/** Returns the SUT module surface or `null` if the module is missing (RED at HEAD). */
function loadTelemetryModuleSafely(): {
  setTelemetryPort: (p: unknown) => void;
  TelemetryPortType: unknown;
} | null {
  try {
    // Path is the contract that T-C55 must honour. If green chooses a
    // different path, this test FAILS — which is the spec-pin we want.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
    const mod = require('@modules/telemetry');
    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      setTelemetryPort: mod.setTelemetryPort,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      TelemetryPortType: mod.TelemetryPort,
    };
  } catch {
    return null;
  }
}

describe('Wave C5 / T-C53 — BE quota-gate → Plausible `quota_exceeded` (integration)', () => {
  const telemetryModule = loadTelemetryModuleSafely();
  const emit = jest.fn<Promise<void>, [Record<string, unknown>]>();

  let repo: jest.Mocked<MonthlyQuotaRepo>;

  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
    emit.mockReset();
    emit.mockResolvedValue();

    // Free-tier user already at the monthly limit → tryConsume returns null
    // → middleware emits 402 + (after C5 green) MUST emit telemetry.
    repo = {
      loadUser: jest.fn().mockResolvedValue({
        id: 1,
        tier: 'free',
        sessionsMonthCount: 3,
        sessionsMonthStart: firstOfThisUtcMonth(),
      }),
      tryConsume: jest.fn().mockResolvedValue(null),
    };
    setMonthlyQuotaRepo(repo);

    // Register a stub TelemetryPort iff the module exists (green phase).
    // At HEAD this branch is skipped and the suite fails at the import
    // assertion below — which IS the red signal.
    if (telemetryModule) {
      telemetryModule.setTelemetryPort({ emit });
    }
  });

  afterEach(() => {
    setMonthlyQuotaRepo(null);
    if (telemetryModule) {
      telemetryModule.setTelemetryPort(null);
    }
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('RED signal — `@modules/telemetry` module must exist with a `setTelemetryPort` symbol (PATTERNS.md §3.2)', () => {
    // This assertion is the first RED signal. At HEAD `89d2d7b44` the module
    // is absent. Green phase T-C55 MUST create
    // `museum-backend/src/modules/telemetry/index.ts` (or a barrel) exporting
    // `setTelemetryPort` and the `TelemetryPort` type, per hex layout from
    // PATTERNS.md §3.2.
    expect(telemetryModule).not.toBeNull();
    expect(typeof telemetryModule?.setTelemetryPort).toBe('function');
  });

  it('R-C5 — POST /api/chat/sessions when quota exhausted → 402 QUOTA_EXCEEDED AND telemetry emit("quota_exceeded") fires exactly once', async () => {
    const token = makeToken({ sub: '1' });

    const res = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${token}`)
      .set('User-Agent', 'MusaiumMobile/1.0 (integration-test)')
      .set('X-Forwarded-For', '203.0.113.42')
      .send({}); // empty body is zod-valid for createSessionSchema

    // (1) Regression anchor — quota contract preserved.
    expect(res.status).toBe(402);
    expect(res.body).toEqual(
      expect.objectContaining({
        code: 'QUOTA_EXCEEDED',
        tier: 'free',
        limit: expect.any(Number) as unknown,
      }),
    );

    // (2) Route handler never reached.
    expect(mockCreateSession).not.toHaveBeenCalled();

    // (3) Quota repo was consulted.
    expect(repo.tryConsume).toHaveBeenCalledTimes(1);

    // (4) MAIN INVARIANT — telemetry emitted exactly once with the
    //     `quota_exceeded` event name and a body that matches the
    //     PATTERNS.md §2 contract (name + url + domain + props).
    expect(emit).toHaveBeenCalledTimes(1);

    const eventArg = emit.mock.calls[0]?.[0];
    expect(eventArg).toBeDefined();
    expect(eventArg).toEqual(
      expect.objectContaining({
        name: 'quota_exceeded',
        url: expect.any(String) as unknown,
        domain: expect.any(String) as unknown,
        props: expect.objectContaining({
          tier: 'free',
          limit: expect.any(Number) as unknown,
        }) as unknown,
      }),
    );
  });

  it('R-C5 anti-PII — emitted event MUST NOT carry user email or other obvious PII in `props` (PATTERNS.md §5)', async () => {
    const token = makeToken({ sub: '1', email: 'user@example.test' });

    await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${token}`)
      .set('User-Agent', 'MusaiumMobile/1.0 (integration-test)')
      .set('X-Forwarded-For', '203.0.113.42')
      .send({});

    expect(emit).toHaveBeenCalledTimes(1);
    const eventArg = emit.mock.calls[0]?.[0] as { props?: Record<string, unknown> };
    expect(eventArg.props).toBeDefined();

    // PATTERNS.md §5 anti-pattern #1 : no PII keys in props.
    // We assert on the obvious PII canaries — green phase MAY widen the
    // strip list, but MUST NOT narrow it below this baseline.
    expect(eventArg.props).not.toHaveProperty('email');
    expect(eventArg.props).not.toHaveProperty('userEmail');
    expect(eventArg.props).not.toHaveProperty('phone');
    expect(eventArg.props).not.toHaveProperty('fullName');
  });
});
