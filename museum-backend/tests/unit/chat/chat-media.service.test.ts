import { ChatMediaService } from '@modules/chat/useCase/audio/chat-media.service';
import { buildCacheKey } from '@modules/chat/useCase/message/chat-cache-key.util';
import { logger } from '@shared/logger/logger';
import type { ChatMessageWithSessionOwnership } from '@modules/chat/domain/session/chat.repository.interface';
import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import type { TextToSpeechService } from '@modules/chat/domain/ports/tts.port';
import { makeSession, makeMessage, makeSessionUser } from '../../helpers/chat/message.fixtures';
import { makeChatRepo } from '../../helpers/chat/repo.fixtures';
import { makeCache } from '../../helpers/chat/cache.fixtures';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const loggerWarn = logger.warn as unknown as jest.Mock;

// ── Factories ──────────────────────────────────────────────────────────

const SESSION_ID = 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4';
const MESSAGE_ID = 'b1b1b1b1-c2c2-4d3d-9e4e-f5f5f5f5f5f5';

const makeMessageRow = (
  msgOverrides: Partial<ChatMessage> = {},
  sessionOverrides: Partial<ChatSession> = {},
): ChatMessageWithSessionOwnership => {
  const session = makeSession({
    id: SESSION_ID,
    user: makeSessionUser(42),
    ...sessionOverrides,
  });
  const message = makeMessage({ ...msgOverrides, session });
  return { message, session };
};

const makeRepo = (messageRow: ChatMessageWithSessionOwnership | null = makeMessageRow()) =>
  makeChatRepo({
    getMessageById: jest.fn().mockResolvedValue(messageRow),
    hasMessageReport: jest.fn().mockResolvedValue(false),
    persistMessageReport: jest.fn().mockResolvedValue(undefined),
    upsertMessageFeedback: jest.fn().mockResolvedValue(undefined),
    deleteMessageFeedback: jest.fn().mockResolvedValue(undefined),
    getMessageFeedback: jest.fn().mockResolvedValue(null),
  });

const makeTts = (): jest.Mocked<TextToSpeechService> => ({
  synthesize: jest.fn().mockResolvedValue({
    audio: Buffer.from('fake-audio'),
    contentType: 'audio/ogg',
  }),
});

// ── Tests ──────────────────────────────────────────────────────────────

describe('ChatMediaService', () => {
  beforeEach(() => jest.clearAllMocks());

  // ── getMessageImageRef ─────────────────────────────────────────────

  describe('getMessageImageRef', () => {
    it('returns external URL image ref as-is', async () => {
      const row = makeMessageRow({ imageRef: 'https://cdn.example.com/img.jpg' });
      const repo = makeRepo(row);
      const svc = new ChatMediaService({ repository: repo });

      const result = await svc.getMessageImageRef(MESSAGE_ID, 42);

      expect(result.imageRef).toBe('https://cdn.example.com/img.jpg');
      expect(result.fileName).toBeUndefined();
    });

    it('resolves local:// ref with fileName and contentType', async () => {
      const row = makeMessageRow({ imageRef: 'local://photo-001.jpg' });
      const repo = makeRepo(row);
      const svc = new ChatMediaService({ repository: repo });

      const result = await svc.getMessageImageRef(MESSAGE_ID, 42);

      expect(result.imageRef).toBe('local://photo-001.jpg');
      expect(result.fileName).toBe('photo-001.jpg');
      expect(result.contentType).toBe('image/jpeg');
    });

    it('throws 404 when message has no image', async () => {
      const row = makeMessageRow({ imageRef: null });
      const repo = makeRepo(row);
      const svc = new ChatMediaService({ repository: repo });

      await expect(svc.getMessageImageRef(MESSAGE_ID, 42)).rejects.toMatchObject({
        statusCode: 404,
        message: 'Chat message image not found',
      });
    });

    it('throws 404 when message does not exist', async () => {
      const repo = makeRepo(null);
      const svc = new ChatMediaService({ repository: repo });

      await expect(svc.getMessageImageRef(MESSAGE_ID, 42)).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  // ── reportMessage ──────────────────────────────────────────────────

  describe('reportMessage', () => {
    it('reports an assistant message successfully', async () => {
      const row = makeMessageRow({ role: 'assistant' });
      const repo = makeRepo(row);
      const svc = new ChatMediaService({ repository: repo });

      const result = await svc.reportMessage(MESSAGE_ID, 'offensive', 42, 'rude content');

      expect(result).toEqual({ messageId: MESSAGE_ID, reported: true });
      expect(repo.persistMessageReport).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: MESSAGE_ID,
          userId: 42,
          reason: 'offensive',
          comment: 'rude content',
        }),
      );
    });

    it('returns reported=true without duplicate persist when already reported', async () => {
      const row = makeMessageRow({ role: 'assistant' });
      const repo = makeRepo(row);
      repo.hasMessageReport.mockResolvedValue(true);
      const svc = new ChatMediaService({ repository: repo });

      const result = await svc.reportMessage(MESSAGE_ID, 'inaccurate', 42);

      expect(result.reported).toBe(true);
      expect(repo.persistMessageReport).not.toHaveBeenCalled();
    });

    it('rejects reporting a user message', async () => {
      const row = makeMessageRow({ role: 'user' });
      const repo = makeRepo(row);
      const svc = new ChatMediaService({ repository: repo });

      await expect(svc.reportMessage(MESSAGE_ID, 'offensive', 42)).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  // ── synthesizeSpeech ───────────────────────────────────────────────

  describe('synthesizeSpeech', () => {
    it('synthesizes speech from assistant message text', async () => {
      const row = makeMessageRow({ role: 'assistant', text: 'Hello world' });
      const repo = makeRepo(row);
      const tts = makeTts();
      const svc = new ChatMediaService({ repository: repo, tts });

      const result = await svc.synthesizeSpeech(MESSAGE_ID, 42);

      expect(result).not.toBeNull();
      expect(result!.contentType).toBe('audio/ogg');
      expect(tts.synthesize).toHaveBeenCalledWith({
        text: 'Hello world',
        voice: 'alloy',
        requestId: MESSAGE_ID,
        // TD-20 (R13a/R12) — per-tenant scope propagated (museumId omitted when
        // the fixture session has null museumId; tier derived from the owner).
        tier: 'free',
      });
    });

    it('throws 501 when TTS is not configured', async () => {
      const row = makeMessageRow({ role: 'assistant', text: 'Hello' });
      const repo = makeRepo(row);
      const svc = new ChatMediaService({ repository: repo }); // no tts

      await expect(svc.synthesizeSpeech(MESSAGE_ID, 42)).rejects.toMatchObject({
        statusCode: 501,
        code: 'FEATURE_UNAVAILABLE',
      });
    });

    it('returns cached audio on cache hit', async () => {
      const row = makeMessageRow({ role: 'assistant', text: 'Cached' });
      const repo = makeRepo(row);
      const tts = makeTts();
      const cache = makeCache();
      cache.get.mockResolvedValue({
        audio: Buffer.from('cached-audio').toString('base64'),
        contentType: 'audio/ogg',
      });
      const svc = new ChatMediaService({ repository: repo, tts, cache });

      const result = await svc.synthesizeSpeech(MESSAGE_ID, 42);

      expect(result).not.toBeNull();
      expect(result!.contentType).toBe('audio/ogg');
      expect(tts.synthesize).not.toHaveBeenCalled();
    });

    // C9.12c (2026-05-17) — cache key MUST include voice id, otherwise switching
    // user.ttsVoice serves stale audio from a previous voice. The cache key
    // shape is `tts:v2:<messageId>:<voiceId>` — voice change → cache miss.
    it('cache key is voice-aware (different voice → cache miss)', async () => {
      const row = makeMessageRow({ role: 'assistant', text: 'Hello' });
      const repo = makeRepo(row);
      const tts = makeTts();
      const cache = makeCache();
      cache.get.mockResolvedValue(null);
      const svc = new ChatMediaService({ repository: repo, tts, cache });

      await svc.synthesizeSpeech(MESSAGE_ID, 42);

      expect(cache.get).toHaveBeenCalledWith(`tts:v2:${MESSAGE_ID}:alloy`);
      expect(cache.set).toHaveBeenCalledWith(
        `tts:v2:${MESSAGE_ID}:alloy`,
        expect.objectContaining({ contentType: 'audio/ogg' }),
        expect.any(Number),
      );
    });

    it('returns null when assistant message has no text', async () => {
      const row = makeMessageRow({ role: 'assistant', text: null });
      const repo = makeRepo(row);
      const tts = makeTts();
      const svc = new ChatMediaService({ repository: repo, tts });

      const result = await svc.synthesizeSpeech(MESSAGE_ID, 42);

      expect(result).toBeNull();
    });

    it('rejects TTS for user messages', async () => {
      const row = makeMessageRow({ role: 'user', text: 'Hello' });
      const repo = makeRepo(row);
      const tts = makeTts();
      const svc = new ChatMediaService({ repository: repo, tts });

      await expect(svc.synthesizeSpeech(MESSAGE_ID, 42)).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  // ── setMessageFeedback ──────────────────────────────────────────────

  describe('setMessageFeedback', () => {
    it('creates positive feedback on an assistant message', async () => {
      const row = makeMessageRow({ role: 'assistant' });
      const repo = makeRepo(row);
      const svc = new ChatMediaService({ repository: repo });

      const result = await svc.setMessageFeedback(MESSAGE_ID, 42, 'positive');

      expect(result).toEqual({ messageId: MESSAGE_ID, status: 'created' });
      expect(repo.getMessageFeedback).toHaveBeenCalledWith(MESSAGE_ID, 42);
      expect(repo.upsertMessageFeedback).toHaveBeenCalledWith(MESSAGE_ID, 42, 'positive');
      expect(repo.deleteMessageFeedback).not.toHaveBeenCalled();
    });

    it('creates negative feedback on an assistant message', async () => {
      const row = makeMessageRow({ role: 'assistant' });
      const repo = makeRepo(row);
      const svc = new ChatMediaService({ repository: repo });

      const result = await svc.setMessageFeedback(MESSAGE_ID, 42, 'negative');

      expect(result).toEqual({ messageId: MESSAGE_ID, status: 'created' });
      expect(repo.upsertMessageFeedback).toHaveBeenCalledWith(MESSAGE_ID, 42, 'negative');
    });

    it('toggles off when same value is submitted again', async () => {
      const row = makeMessageRow({ role: 'assistant' });
      const repo = makeRepo(row);
      repo.getMessageFeedback.mockResolvedValue({ value: 'positive' });
      const svc = new ChatMediaService({ repository: repo });

      const result = await svc.setMessageFeedback(MESSAGE_ID, 42, 'positive');

      expect(result).toEqual({ messageId: MESSAGE_ID, status: 'removed' });
      expect(repo.deleteMessageFeedback).toHaveBeenCalledWith(MESSAGE_ID, 42);
      expect(repo.upsertMessageFeedback).not.toHaveBeenCalled();
    });

    it('updates when switching from positive to negative', async () => {
      const row = makeMessageRow({ role: 'assistant' });
      const repo = makeRepo(row);
      repo.getMessageFeedback.mockResolvedValue({ value: 'positive' });
      const svc = new ChatMediaService({ repository: repo });

      const result = await svc.setMessageFeedback(MESSAGE_ID, 42, 'negative');

      expect(result).toEqual({ messageId: MESSAGE_ID, status: 'updated' });
      expect(repo.upsertMessageFeedback).toHaveBeenCalledWith(MESSAGE_ID, 42, 'negative');
      expect(repo.deleteMessageFeedback).not.toHaveBeenCalled();
    });

    it('updates when switching from negative to positive', async () => {
      const row = makeMessageRow({ role: 'assistant' });
      const repo = makeRepo(row);
      repo.getMessageFeedback.mockResolvedValue({ value: 'negative' });
      const svc = new ChatMediaService({ repository: repo });

      const result = await svc.setMessageFeedback(MESSAGE_ID, 42, 'positive');

      expect(result).toEqual({ messageId: MESSAGE_ID, status: 'updated' });
      expect(repo.upsertMessageFeedback).toHaveBeenCalledWith(MESSAGE_ID, 42, 'positive');
    });

    it('throws 404 when message does not exist', async () => {
      const repo = makeRepo(null);
      const svc = new ChatMediaService({ repository: repo });

      await expect(svc.setMessageFeedback(MESSAGE_ID, 42, 'positive')).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('throws 400 when message is not from assistant', async () => {
      const row = makeMessageRow({ role: 'user' });
      const repo = makeRepo(row);
      const svc = new ChatMediaService({ repository: repo });

      await expect(svc.setMessageFeedback(MESSAGE_ID, 42, 'positive')).rejects.toMatchObject({
        statusCode: 400,
        message: 'Only assistant messages can receive feedback',
      });
    });

    it('throws 400 for invalid message id format', async () => {
      const repo = makeRepo();
      const svc = new ChatMediaService({ repository: repo });

      await expect(svc.setMessageFeedback('not-a-uuid', 42, 'positive')).rejects.toMatchObject({
        statusCode: 400,
        message: 'Invalid message id format',
      });
    });
  });

  // ── F2 feedback-invalidation cartesian ─────────────────────────────────
  //
  // Spec F2.1/F2.2/F2.3 (2026-05-19 run, design.md D2). Today's
  // `chat-media.service.ts:178` hardcodes `audioDescriptionMode:false` AND
  // omits `voiceMode` entirely — so negative feedback only invalidates the
  // single `false × undefined` shape and leaves stale entries for the 3 other
  // cartesian shapes (audioDescriptionMode × voiceMode ∈ {false,true}²)
  // plus the cross-namespace dual (global + user-scoped).
  //
  // These tests pin the corrected contract: 4 shapes × 2 namespaces = 8 del
  // calls when an owner is present, 4 when anon. Partial failures (one bad
  // `del`) must NOT skip the other keys (fail-open, per-key try/catch).
  describe('F2 feedback-invalidation cartesian', () => {
    const USER_MSG_ID = 'c2c2c2c2-d3d3-4e4e-9f5f-a6a6a6a6a6a6';
    const ASSISTANT_MSG_ID = MESSAGE_ID;
    const MUSEUM_ID = 42;
    const OWNER_ID = 7;
    const USER_TEXT = 'What is impressionism?';

    /**
     * Builds the 4 cartesian shape keys for a given namespace (global or user).
     * @param opts
     * @param opts.ownerId
     */
    const expectedShapeKeys = (opts: { ownerId?: number }): string[] => {
      const baseInput = {
        text: USER_TEXT,
        museumId: String(MUSEUM_ID),
        locale: 'fr',
        guideLevel: 'beginner',
        hasHistory: false,
        hasAttachment: false,
        hasGeo: false,
      };
      const keys: string[] = [];
      for (const audioDescriptionMode of [false, true]) {
        for (const voiceMode of [false, true]) {
          keys.push(
            buildCacheKey({
              ...baseInput,
              audioDescriptionMode,
              voiceMode,
              ...(opts.ownerId !== undefined ? { userId: opts.ownerId } : {}),
            }),
          );
        }
      }
      return keys;
    };

    const setupNegativeFeedbackScenario = (opts: { withOwner: boolean }) => {
      const session = makeSession({
        id: SESSION_ID,
        museumId: MUSEUM_ID,
        locale: 'fr',
        user: opts.withOwner ? makeSessionUser(OWNER_ID) : undefined,
      });

      const userMsg = makeMessage({
        id: USER_MSG_ID,
        role: 'user',
        text: USER_TEXT,
        session,
      });
      const assistantMsg = makeMessage({
        id: ASSISTANT_MSG_ID,
        role: 'assistant',
        text: 'Impressionism is...',
        session,
      });

      const row: ChatMessageWithSessionOwnership = { message: assistantMsg, session };

      const repo = makeChatRepo({
        getMessageById: jest.fn().mockResolvedValue(row),
        getMessageFeedback: jest.fn().mockResolvedValue(null),
        upsertMessageFeedback: jest.fn().mockResolvedValue(undefined),
        listSessionHistory: jest.fn().mockResolvedValue([userMsg, assistantMsg]),
      });
      const cache = makeCache();
      const callerId = opts.withOwner ? OWNER_ID : undefined;
      const svc = new ChatMediaService({ repository: repo, cache });
      return { svc, repo, cache, callerId };
    };

    beforeEach(() => {
      loggerWarn.mockClear();
    });

    // F2.2 — authenticated owner: full 4-shape × 2-namespace cartesian (8 keys).
    it('deletes 8 distinct cartesian keys when session has an owner', async () => {
      const { svc, cache, callerId } = setupNegativeFeedbackScenario({ withOwner: true });

      await svc.setMessageFeedback(ASSISTANT_MSG_ID, callerId!, 'negative');

      const calledWith = cache.del.mock.calls.map((args) => args[0]);
      // 8 calls total — 4 shapes × (global + user) namespaces.
      expect(cache.del).toHaveBeenCalledTimes(8);
      // All keys distinct (no duplicates).
      expect(new Set(calledWith).size).toBe(8);

      const expected = [
        ...expectedShapeKeys({}), // global (no userId)
        ...expectedShapeKeys({ ownerId: OWNER_ID }), // user-scoped
      ];
      expect(new Set(calledWith)).toEqual(new Set(expected));
    });

    // F2.2 — anonymous session: global namespace only, 4 keys.
    it('deletes only 4 global keys when session.user is undefined (anon)', async () => {
      // Anon session: setMessageFeedback enforces ensureSessionOwnership which
      // requires session.user.id when currentUserId is provided. Use
      // currentUserId=undefined to traverse the anon path while still
      // exercising invalidateCacheForFeedback. Repo-level guards skipped here
      // — this test pins the cache invalidation contract, not auth.
      const { svc, cache } = setupNegativeFeedbackScenario({ withOwner: false });

      // Anon caller (no currentUserId) — ensureSessionOwnership allows when
      // both session.user.id and currentUserId are undefined.
      await svc.setMessageFeedback(ASSISTANT_MSG_ID, undefined as unknown as number, 'negative');

      const calledWith = cache.del.mock.calls.map((args) => args[0]);
      expect(cache.del).toHaveBeenCalledTimes(4);
      expect(new Set(calledWith).size).toBe(4);
      expect(new Set(calledWith)).toEqual(new Set(expectedShapeKeys({})));
    });

    // F2.3 — partial failure resilience: 1st del rejects, others still attempted.
    it('continues invalidating remaining keys when first cache.del rejects', async () => {
      const { svc, cache, callerId } = setupNegativeFeedbackScenario({ withOwner: true });
      cache.del.mockRejectedValueOnce(new Error('redis down'));

      // Should NOT throw — fail-open contract.
      await expect(
        svc.setMessageFeedback(ASSISTANT_MSG_ID, callerId!, 'negative'),
      ).resolves.toEqual({ messageId: ASSISTANT_MSG_ID, status: 'created' });

      // All 8 del calls still attempted despite the first one rejecting.
      expect(cache.del).toHaveBeenCalledTimes(8);

      // logger.warn emitted at least once with the redis-down error.
      expect(loggerWarn).toHaveBeenCalled();
      const warnCalls = loggerWarn.mock.calls;
      const sawRedisDown = warnCalls.some((call) => {
        const payload = call[1] as Record<string, unknown> | undefined;
        const errStr = payload?.error;
        return typeof errStr === 'string' && errStr.includes('redis down');
      });
      expect(sawRedisDown).toBe(true);
    });
  });
});
