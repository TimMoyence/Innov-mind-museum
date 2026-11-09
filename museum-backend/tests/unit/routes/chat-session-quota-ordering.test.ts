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
    mockCreateSession.mockResolvedValue({ session: { id: 'stub-session-id' } });
  });

  afterEach(() => {
    setMonthlyQuotaRepo(null);
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

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
    expect(repo.tryConsume).not.toHaveBeenCalled();
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('F1.AC6: 3× zod-400 then valid `{}` → 4th returns 201 (counter never inflated)', async () => {
    const token = makeToken();

    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/chat/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send([]);
      expect(res.status).toBe(400);
    }
    expect(repo.tryConsume).not.toHaveBeenCalled();

    const ok = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(ok.status).toBe(201);
    expect(repo.tryConsume).toHaveBeenCalledTimes(1);
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });

  it('F1.R5 / Risk4: two parallel POSTs serialize → exactly one 201 + one 402, counter at limit (not limit+1)', async () => {
    const token = makeToken();
    const monthStart = firstOfThisUtcMonth();

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

    const refused = r1.status === 402 ? r1 : r2;
    expect(refused.body).toEqual(
      expect.objectContaining({ code: 'QUOTA_EXCEEDED', tier: 'free', limit: 3 }),
    );
  });
});
