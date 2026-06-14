/**
 * F1 RED — Zod 400 short-circuit MUST NOT burn the monthly-quota counter.
 *
 * Pins F1 §1 R1, R6, R9 + §2 AC1/AC2/AC3/AC4/AC6 down BEFORE implementation.
 *
 * BUG (bug_001) at HEAD `2d9dfaa1` : `chat-session.route.ts` mounts
 * `monthlySessionQuota` BEFORE `validateBody(createSessionSchema)`. Any zod-400
 * (non-object body, museumId <= 0, lat > 90, intent not in enum, locale wrong
 * type) burns a free-tier session slot for a session that is NEVER created.
 *
 * The fix swaps the middleware order (F1 §3.1 option (a)). After the fix :
 *  - F1.R1 — zod-400 MUST NOT call `repo.tryConsume`.
 *  - F1.R6 — body `{}` (zod-valid, all fields optional) still increments.
 *  - F1.R9 — `quota_check_hit_limit` log fires only on TRUE 402, never on 400.
 *  - F1.AC6 — 3× zod-400 then a valid body STILL returns 201 (not 402).
 *
 * Test strategy : in-process supertest against `createApp` with a stub
 * `chatService` AND a stub `MonthlyQuotaRepo` wired via `setMonthlyQuotaRepo`.
 * The repo's `tryConsume` is a jest mock whose call-count is the F1 invariant
 * — at HEAD it WILL be called on zod-400 inputs (RED) ; after the swap it MUST
 * NOT be called.
 *
 * Spec drift logged in report : the F1 brief / spec uses `/api/sessions`
 * shorthand. The real mount is `/api/chat/sessions` (api.router → chat.route →
 * createSessionRouter). Using the real path here.
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

describe('F1 — chat-session quota ordering (Zod 400 must not burn counter)', () => {
  let repo: jest.Mocked<MonthlyQuotaRepo>;

  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
    // Fresh free-tier user, count=0, monthStart=NULL (R6 rollover branch).
    repo = {
      loadUser: jest.fn().mockResolvedValue({
        id: 1,
        tier: 'free',
        sessionsMonthCount: 0,
        sessionsMonthStart: null,
      }),
      tryConsume: jest.fn().mockResolvedValue({
        sessionsMonthCount: 1,
        sessionsMonthStart: firstOfThisUtcMonth(),
      }),
    };
    setMonthlyQuotaRepo(repo);
    // Default — handler returns a stub session for the valid-body sub-cases.
    mockCreateSession.mockResolvedValue({ session: { id: 'stub-session-id' } });
  });

  afterEach(() => {
    setMonthlyQuotaRepo(null);
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  // ── F1.AC1-AC4 — every zod-400 vector leaves counter untouched ─────

  it.each([
    ['F1.AC1 — non-object body `[]`', [] as unknown],
    ['F1.AC2 — museumId=-1', { museumId: -1 }],
    ['F1.AC3 — coordinates.lat=91', { coordinates: { lat: 91, lng: 0 } }],
    ['F1.AC4 — intent="invalid_intent"', { intent: 'invalid_intent' }],
  ])('%s → 400 AND repo.tryConsume NOT called', async (_label, body) => {
    const token = makeToken();
    const res = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send(body as object);

    expect(res.status).toBe(400);
    // tryConsume MUST NOT be called on zod-400 — counter stays at 0.
    expect(repo.tryConsume).not.toHaveBeenCalled();
    // Handler MUST NOT execute either.
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  // ── F1.AC6 — 3× zod-400 then valid body still returns 201 ──────────

  it('F1.AC6: 3× zod-400 then valid `{}` → 4th returns 201 (counter never inflated)', async () => {
    const token = makeToken();

    // Three malformed posts — each MUST 400 without touching the counter.
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send([]);
      expect(res.status).toBe(400);
    }
    expect(repo.tryConsume).not.toHaveBeenCalled();

    // Fourth post is zod-valid → tryConsume gets called exactly ONCE, 201.
    const ok = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(ok.status).toBe(201);
    expect(repo.tryConsume).toHaveBeenCalledTimes(1);
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });

  // ── Test C — Concurrent race re-verification (R1 §3.3 D2 invariant) ─

  it('F1.R5 / Risk4: two parallel POSTs serialize → exactly one 201 + one 402, counter at limit (not limit+1)', async () => {
    const token = makeToken();
    const monthStart = firstOfThisUtcMonth();

    // Seed user already at `limit - 1` = 2 (default limit 3, R13). Two
    // parallel zod-valid posts both reach `tryConsume` ; the PG atomic
    // UPDATE serialises and the race-loser gets `null` back → 402.
    repo.loadUser.mockResolvedValue({
      id: 1,
      tier: 'free',
      sessionsMonthCount: 2,
      sessionsMonthStart: monthStart,
    });
    repo.tryConsume
      .mockResolvedValueOnce({ sessionsMonthCount: 3, sessionsMonthStart: monthStart })
      .mockResolvedValueOnce(null);

    const [r1, r2] = await Promise.all([
      request(app).post('/api/chat/sessions').set('Authorization', `Bearer ${token}`).send({}),
      request(app).post('/api/chat/sessions').set('Authorization', `Bearer ${token}`).send({}),
    ]);

    const statuses = [r1.status, r2.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 402]);
    expect(repo.tryConsume).toHaveBeenCalledTimes(2);

    // 402 response shape pinned (F1.N5 — mobile axios interceptor contract).
    const refused = r1.status === 402 ? r1 : r2;
    expect(refused.body).toEqual(
      expect.objectContaining({ code: 'QUOTA_EXCEEDED', tier: 'free', limit: 3 }),
    );
  });

  // ── Test D — Documented residual hole (handler 5xx tail under D1=(a)) ─
  // F1.Risk1 V1.1 (handler 5xx after counter increment leaves counter inflated)
  // is now materialized as a real integration test (Tier=integration, real PG
  // row) — see tests/integration/quota/monthly-session-quota-inflation.integration.test.ts
  // (UC-H12-01). A mock repo here cannot prove the PERSISTED counter reverted,
  // so the bare it.todo was promoted to that integration test rather than left
  // permanently pending.
});
