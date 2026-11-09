import request from 'supertest';

import { createApp } from '@src/app';
import {
  setMonthlyQuotaRepo,
  type MonthlyQuotaRepo,
} from '@shared/middleware/monthly-session-quota.middleware';
import { makeToken } from 'tests/helpers/auth/token.helpers';
import { resetRateLimits, stopRateLimitSweep } from 'tests/helpers/http/route-test-setup';
import { assertMatchesOpenApiResponse } from 'tests/helpers/openapi/openapi-response-validator';

import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';

const app = createApp({
  chatService: { createSession: jest.fn() } as unknown as ChatService,
  healthCheck: async () => ({ database: 'up' }),
});

describe('contrat — quota mensuel atteint', () => {
  beforeEach(() => {
    resetRateLimits();
    const exhausted: MonthlyQuotaRepo = {
      loadUser: jest.fn().mockResolvedValue({
        id: 1,
        tier: 'free',
        sessionsMonthCount: 3,
        sessionsMonthStart: new Date(),
      }),
      tryConsume: jest.fn().mockResolvedValue(null),
    };
    setMonthlyQuotaRepo(exhausted);
  });

  afterEach(() => {
    setMonthlyQuotaRepo(null);
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('AUDIT-2026-11-09 · le 402 QUOTA_EXCEEDED de POST /api/chat/sessions suit le contrat OpenAPI', async () => {
    const res = await request(app)
      .post('/api/chat/sessions')
      .set('Authorization', `Bearer ${makeToken()}`)
      .send({});

    expect(res.status).toBe(402);
    assertMatchesOpenApiResponse({
      path: '/api/chat/sessions',
      method: 'post',
      statusCode: 402,
      payload: res.body,
    });
  });
});
