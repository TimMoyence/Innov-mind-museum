import { createHash } from 'node:crypto';

import request from 'supertest';

import { configureIdempotency } from '@modules/chat/useCase/message/idempotency.store';
import { createApp } from '@src/app';
import { resetRateLimits, stopRateLimitSweep } from 'tests/helpers/http/route-test-setup';
import { userToken, makeToken } from 'tests/helpers/auth/token.helpers';

import { InMemoryCacheService } from '../../helpers/cache/inMemoryCacheService';

import type { ChatService } from '@modules/chat/useCase/orchestration/chat.service';

const SESSION_ID = 'session-uuid';
const IDEMPOTENCY_HEADER = 'Idempotency-Key';

const makeReply = (messageId: string) => ({
  sessionId: SESSION_ID,
  message: {
    id: messageId,
    role: 'assistant',
    text: 'The Mona Lisa is a masterpiece.',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  metadata: {},
});

describe('idempotency middleware — POST /api/chat/sessions/:id/messages', () => {
  let mockPostMessage: jest.Mock;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    resetRateLimits();
    jest.clearAllMocks();
    configureIdempotency({ cache: new InMemoryCacheService() });

    mockPostMessage = jest.fn();
    const mockChatService: Partial<ChatService> = {
      postMessage: mockPostMessage,
    };
    app = createApp({
      chatService: mockChatService as ChatService,
      healthCheck: async () => ({ database: 'up' }),
    });
  });

  afterAll(() => {
    stopRateLimitSweep();
  });

  it('R1 — same Idempotency-Key twice runs postMessage ONCE and replays the identical 201 body', async () => {
    const reply = makeReply('msg-1');
    mockPostMessage.mockResolvedValue(reply);
    const token = userToken();

    const first = await request(app)
      .post(`/api/chat/sessions/${SESSION_ID}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .set(IDEMPOTENCY_HEADER, 'flush-key-1')
      .send({ text: 'Tell me about the Mona Lisa' });

    const second = await request(app)
      .post(`/api/chat/sessions/${SESSION_ID}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .set(IDEMPOTENCY_HEADER, 'flush-key-1')
      .send({ text: 'Tell me about the Mona Lisa' });

    expect(mockPostMessage).toHaveBeenCalledTimes(1);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(second.body).toEqual(reply);
  });

  it('R2 — distinct Idempotency-Keys run postMessage twice', async () => {
    mockPostMessage
      .mockResolvedValueOnce(makeReply('msg-1'))
      .mockResolvedValueOnce(makeReply('msg-2'));
    const token = userToken();

    await request(app)
      .post(`/api/chat/sessions/${SESSION_ID}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .set(IDEMPOTENCY_HEADER, 'key-a')
      .send({ text: 'first' });

    await request(app)
      .post(`/api/chat/sessions/${SESSION_ID}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .set(IDEMPOTENCY_HEADER, 'key-b')
      .send({ text: 'second' });

    expect(mockPostMessage).toHaveBeenCalledTimes(2);
  });

  it('R2 — no header → no dedup, postMessage runs once per request (zero-overhead passthrough)', async () => {
    mockPostMessage.mockResolvedValue(makeReply('msg-1'));
    const token = userToken();

    const first = await request(app)
      .post(`/api/chat/sessions/${SESSION_ID}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'no key 1' });

    const second = await request(app)
      .post(`/api/chat/sessions/${SESSION_ID}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'no key 2' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(mockPostMessage).toHaveBeenCalledTimes(2);
  });

  it('NFR — the key is scoped by userId: the same Idempotency-Key from a DIFFERENT user is NOT deduped', async () => {
    mockPostMessage
      .mockResolvedValueOnce(makeReply('msg-1'))
      .mockResolvedValueOnce(makeReply('msg-2'));
    const userA = makeToken({ sub: '1' });
    const userB = makeToken({ sub: '2' });

    await request(app)
      .post(`/api/chat/sessions/${SESSION_ID}/messages`)
      .set('Authorization', `Bearer ${userA}`)
      .set(IDEMPOTENCY_HEADER, 'shared-key')
      .send({ text: 'from user A' });

    await request(app)
      .post(`/api/chat/sessions/${SESSION_ID}/messages`)
      .set('Authorization', `Bearer ${userB}`)
      .set(IDEMPOTENCY_HEADER, 'shared-key')
      .send({ text: 'from user B' });

    expect(mockPostMessage).toHaveBeenCalledTimes(2);
  });

  it('NFR — the key is scoped by sessionId: the same Idempotency-Key on a DIFFERENT session is NOT deduped', async () => {
    mockPostMessage
      .mockResolvedValueOnce(makeReply('msg-1'))
      .mockResolvedValueOnce(makeReply('msg-2'));
    const token = userToken();

    await request(app)
      .post(`/api/chat/sessions/session-one/messages`)
      .set('Authorization', `Bearer ${token}`)
      .set(IDEMPOTENCY_HEADER, 'shared-key')
      .send({ text: 'session one' });

    await request(app)
      .post(`/api/chat/sessions/session-two/messages`)
      .set('Authorization', `Bearer ${token}`)
      .set(IDEMPOTENCY_HEADER, 'shared-key')
      .send({ text: 'session two' });

    expect(mockPostMessage).toHaveBeenCalledTimes(2);
  });

  describe('SEC — over-long Idempotency-Key (MEDIUM finding: unbounded user header → Redis memory DoS)', () => {
    const OVER_LONG_KEY = 'X'.repeat(300);
    const EXPECTED_DIGEST = createHash('sha256').update(OVER_LONG_KEY).digest('hex');

    it('hashes an over-long key (sha256) before use: stored key is bounded, raw 300-char value never appears', async () => {
      const cache = new InMemoryCacheService();
      const capturedKeys: string[] = [];
      const captureKey = (key: string): void => {
        capturedKeys.push(key);
      };
      const originalSet = cache.set.bind(cache);
      const originalSetNx = cache.setNx.bind(cache);
      cache.set = async <T>(key: string, value: T, ttlSeconds?: number): Promise<void> => {
        captureKey(key);
        return originalSet(key, value, ttlSeconds);
      };
      cache.setNx = async <T>(key: string, value: T, ttlSeconds: number): Promise<boolean> => {
        captureKey(key);
        return originalSetNx(key, value, ttlSeconds);
      };
      configureIdempotency({ cache });

      mockPostMessage.mockResolvedValue(makeReply('msg-1'));
      const token = userToken();

      const first = await request(app)
        .post(`/api/chat/sessions/${SESSION_ID}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .set(IDEMPOTENCY_HEADER, OVER_LONG_KEY)
        .send({ text: 'over-long key 1' });

      const second = await request(app)
        .post(`/api/chat/sessions/${SESSION_ID}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .set(IDEMPOTENCY_HEADER, OVER_LONG_KEY)
        .send({ text: 'over-long key 2' });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body).toEqual(first.body);
      expect(mockPostMessage).toHaveBeenCalledTimes(1);

      expect(capturedKeys.length).toBeGreaterThan(0);
      for (const key of capturedKeys) {
        expect(key).not.toContain(OVER_LONG_KEY);
        expect(key).toContain(EXPECTED_DIGEST);
        for (const segment of key.split(':')) {
          expect(segment.length).toBeLessThanOrEqual(EXPECTED_DIGEST.length);
        }
      }
    });
  });
});
