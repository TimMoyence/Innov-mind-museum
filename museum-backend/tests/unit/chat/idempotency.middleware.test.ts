/**
 * RUN_ID 2026-06-01-weak-net-idempotency — phase RED (UFR-022).
 *
 * W1-IDEM-03 — middleware-level tests on `POST /api/chat/sessions/:id/messages`
 * (design § "BE middleware"). The idempotency middleware, mounted inside
 * `createMessageRouter` AFTER auth/rate/cost guards (CLAUDE.md "Mutating
 * middleware ordering"), MUST:
 *   - R1  same `Idempotency-Key` twice → `chatService.postMessage` runs ONCE,
 *         and both HTTP responses carry the identical 201 body;
 *   - R2  distinct keys → `postMessage` runs twice;
 *   - R2  no header → behaves exactly as today (next(), zero overhead, no
 *         dedup, `postMessage` runs once per request);
 *   - NFR the dedup key is scoped by `Idempotency-Key + userId + sessionId` so
 *         a Zod-400 (or a different user / session) does NOT burn the key.
 *
 * Wired via `configureIdempotency({ cache })` (mirrors
 * `configureGuardrailFriction` at chat-module.ts:719) against the in-memory
 * cache stub so no Redis is required.
 *
 * RED expectation: neither `@modules/chat/useCase/message/idempotency.store`
 * (configureIdempotency) nor the middleware mount exists yet. The import fails
 * to compile AND — once it does — the un-deduped route runs `postMessage`
 * twice for a repeated key → assertions fail → scoped run exits ≠ 0.
 *
 * Run scope: pnpm test -- --testPathPattern="idempotency"
 */
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
    // No header on either request → each one reaches the handler.
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

    // Same raw key but different userId scope → two creates, no cross-user replay.
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
    // A user-controlled header of arbitrary length must NOT be used verbatim as
    // (a segment of) the cache key. The middleware SHALL bound it by hashing
    // (sha256) before scoping, so the stored key length is bounded by the digest
    // size (64 hex chars) regardless of how large the raw header is — while two
    // requests carrying the SAME over-long key still deduplicate (legit retry).
    const OVER_LONG_KEY = 'X'.repeat(300); // > 200-char cap
    const EXPECTED_DIGEST = createHash('sha256').update(OVER_LONG_KEY).digest('hex'); // 64 hex chars

    it('hashes an over-long key (sha256) before use: stored key is bounded, raw 300-char value never appears', async () => {
      const cache = new InMemoryCacheService();
      const capturedKeys: string[] = [];
      const captureKey = (key: string): void => {
        capturedKeys.push(key);
      };
      const originalSet = cache.set.bind(cache);
      const originalSetNx = cache.setNx.bind(cache);
      // Spy on every write path the store uses (reserve via setNx, result via set).
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

      // (a) Dedup still holds for a legit long key: producer runs ONCE.
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body).toEqual(first.body);
      expect(mockPostMessage).toHaveBeenCalledTimes(1);

      // (b) The raw 300-char header must never be embedded in a stored cache key.
      expect(capturedKeys.length).toBeGreaterThan(0);
      for (const key of capturedKeys) {
        expect(key).not.toContain(OVER_LONG_KEY);
        // The bounded digest is what gets scoped in instead.
        expect(key).toContain(EXPECTED_DIGEST);
        // The header-derived segment is length-bounded by the 64-hex digest:
        // no key segment may carry an arbitrarily long user-controlled value.
        for (const segment of key.split(':')) {
          expect(segment.length).toBeLessThanOrEqual(EXPECTED_DIGEST.length);
        }
      }
    });
  });
});
