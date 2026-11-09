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

function loadTelemetryModuleSafely(): {
  setTelemetryPort: (p: unknown) => void;
} | null {
  try {
    const mod = require('@modules/telemetry');
    return {
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

    expect(res.status).toBe(402);
    expect(res.body).toEqual(
      expect.objectContaining({
        code: 'QUOTA_EXCEEDED',
        tier: 'free',
        limit: expect.any(Number) as unknown,
      }),
    );
    expect(mockCreateSession).not.toHaveBeenCalled();

    expect(emit).toHaveBeenCalledTimes(1);

    const eventArg = emit.mock.calls[0]?.[0];
    expect(eventArg).toBeDefined();

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
