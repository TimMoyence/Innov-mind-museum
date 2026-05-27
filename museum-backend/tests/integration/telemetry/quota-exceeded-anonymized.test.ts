/**
 * CYCLE 3 / C3.1 (T1.1) — RED integration test for RGPD anonymisation of the
 * BE-emitted `quota_exceeded` funnel event.
 *
 * Pins spec-c3.md §4 REQ-C3.1.1/2/3/5 + design-c3.md §6 down BEFORE the green
 * middleware change. The decision (spec §0 Approach A / design D2) : the quota
 * middleware `emitQuotaExceeded` MUST stop forwarding the visitor IP
 * (`clientIp`) and User-Agent (`userAgent`) to the telemetry port, because the
 * event is emitted server-side without any analytics-consent signal (consent
 * state lives client-side, AsyncStorage) and IP/UA are personal data
 * (RGPD Art. 4(1), CJUE C-582/14 Breyer). Anonymising at the source removes
 * the PII (recital 26) → no legal basis required.
 *
 * Lib-docs consulted :
 *  - `lib-docs/express/PATTERNS.md` §2 (`req.get(...)` / `req.ip` accessors used
 *    by the quota middleware) + §3.9 (production env). The middleware under
 *    test reads `req.get('user-agent')` and `req.ip` ; this test sends both an
 *    incoming `User-Agent` header and `X-Forwarded-For` (so `req.ip` resolves
 *    under `trust proxy`) to PROVE the omission is deliberate, not incidental.
 *  - `lib-docs/express/LESSONS.md` (no rate-limiter body-read ordering concern
 *    here — the quota gate keys off the auth-derived user id, not body).
 *  - `lib-docs/plausible/PATTERNS.md` — ABSENT from the worktree (design-c3.md
 *    OQ1). The anonymisation rationale rests on the port contract
 *    (`telemetry.port.ts` declares `userAgent?`/`clientIp?` OPTIONAL) + the
 *    adapter guards (`plausible.adapter.ts:66-67` only set the
 *    `User-Agent`/`X-Forwarded-For` headers `if (event.userAgent)` /
 *    `if (event.clientIp)`), both read directly — not on an invented pattern.
 *    WARN-tag: lib-docs/plausible/PATTERNS.md missing → use-stale (offline).
 *
 * Distinct from the C5 regression anchor `funnel-quota-exceeded.test.ts`
 * (design-c3.md D1 — that file uses `objectContaining` and does NOT assert on
 * IP/UA, so it stays green after anonymisation ; it is the frozen regression
 * anchor and is NOT touched). This file is the dedicated anonymisation pin.
 *
 * RED state — at baseline `a0654e7c6` :
 *  `monthly-session-quota.middleware.ts:111-112` STILL passes
 *  `userAgent: req.get('user-agent') ?? undefined` and
 *  `clientIp: req.ip ?? undefined` into `getTelemetryPort().emit({...})`.
 *  Because the request carries `User-Agent` + `X-Forwarded-For`, the emitted
 *  event object DOES carry `userAgent`/`clientIp` → the
 *  `not.toHaveProperty('clientIp')` / `not.toHaveProperty('userAgent')`
 *  assertions FAIL. That is the targeted RED signal (AC-C3.1.d). The 402 and
 *  the business fields already pass at baseline — only the anonymisation
 *  invariant must fail.
 *
 * Frozen-test invariant (UFR-022 phase red) : immutable byte-for-byte once
 * committed. A green agent suspecting a wrong test MUST emit
 * `BLOCK-TEST-WRONG <path>:<line> <reason>` and let the dispatcher re-spawn a
 * fresh red phase — NEVER edit this file from a green/reviewer phase.
 *
 * Scoped run :
 *   cd museum-backend && pnpm test --testPathPattern=quota-exceeded-anonymized \
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

import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';

// Stub ChatService — createSession must NOT be invoked when the quota gate
// fires (the 402 short-circuits the route handler). Asserted as a defensive
// regression invariant (REQ-C3.1.5).
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

/** Returns the telemetry SUT module surface or `null` if absent. */
function loadTelemetryModuleSafely(): {
  setTelemetryPort: (p: unknown) => void;
} | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
    const mod = require('@modules/telemetry');
    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
      setTelemetryPort: mod.setTelemetryPort,
    };
  } catch {
    return null;
  }
}

describe('C3.1 / T1.1 — `quota_exceeded` emitted WITHOUT clientIp/userAgent (RGPD anonymised)', () => {
  const telemetryModule = loadTelemetryModuleSafely();
  const emit = jest.fn<Promise<void>, [Record<string, unknown>]>();

  let repo: jest.Mocked<MonthlyQuotaRepo>;

  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
    emit.mockReset();
    emit.mockResolvedValue();

    // Free-tier user already at the monthly limit → tryConsume returns null
    // → middleware emits 402 AND emits the telemetry event.
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

  it('telemetry module surface (`setTelemetryPort`) must be present — precondition', () => {
    expect(telemetryModule).not.toBeNull();
    expect(typeof telemetryModule?.setTelemetryPort).toBe('function');
  });

  it('AC-C3.1.a — emitted event has NEITHER clientIp NOR userAgent even when the request carries User-Agent + X-Forwarded-For', async () => {
    const token = makeToken({ sub: '1' });

    const res = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${token}`)
      .set('User-Agent', 'MusaiumMobile/1.0 (anonymisation-test)')
      .set('X-Forwarded-For', '203.0.113.42')
      .send({});

    // Regression anchor — 402 contract preserved (REQ-C3.1.5).
    expect(res.status).toBe(402);
    expect(res.body).toEqual(
      expect.objectContaining({
        code: 'QUOTA_EXCEEDED',
        tier: 'free',
        limit: expect.any(Number) as unknown,
      }),
    );
    expect(mockCreateSession).not.toHaveBeenCalled();

    // Emit fired exactly once (REQ-C3.1.3).
    expect(emit).toHaveBeenCalledTimes(1);

    const eventArg = emit.mock.calls[0]?.[0];
    expect(eventArg).toBeDefined();

    // MAIN INVARIANT (AC-C3.1.a) — no PII forwarded to the telemetry port.
    expect(eventArg).not.toHaveProperty('clientIp');
    expect(eventArg).not.toHaveProperty('userAgent');
  });

  it('AC-C3.1.b — business fields (name/url/domain/props.tier/props.limit) are preserved', async () => {
    const token = makeToken({ sub: '1' });

    await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${token}`)
      .set('User-Agent', 'MusaiumMobile/1.0 (anonymisation-test)')
      .set('X-Forwarded-For', '203.0.113.42')
      .send({});

    expect(emit).toHaveBeenCalledTimes(1);
    const eventArg = emit.mock.calls[0]?.[0];
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
});
