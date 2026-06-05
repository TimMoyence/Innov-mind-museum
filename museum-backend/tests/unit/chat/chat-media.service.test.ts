import { ChatMediaService } from '@modules/chat/useCase/audio/chat-media.service';
import type { ChatMessageWithSessionOwnership } from '@modules/chat/domain/session/chat.repository.interface';
import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import type { TextToSpeechService } from '@modules/chat/domain/ports/tts.port';
import { makeSession, makeMessage, makeSessionUser } from '../../helpers/chat/message.fixtures';
import { makeChatRepo } from '../../helpers/chat/repo.fixtures';
import { makeCache } from '../../helpers/chat/cache.fixtures';

// Silence logger during tests (no assertions on logger here — see
// `feedback-cache-invalidation.test.ts` for shape-of-log assertions).
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

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

  // ── Feedback-invalidation ──────────────────────────────────────────────
  //
  // PR-P0-1 (2026-05-23) — the previous F2 cartesian block (8/4 `del` calls
  // across {audioDescriptionMode × voiceMode} × {global + user-scoped})
  // tested the now-removed `buildFeedbackInvalidationKeys` helper, which
  // emitted `chat:llm:*` keys that have NO writers in the production cache
  // (real writes go through `LlmCacheServiceImpl` under `llm:v2:*`). The
  // cartesian targeted 0 real entries.
  //
  // The corrected contract — targeted 1-entry `del(message.cacheKey)` with
  // fail-open WARN log on throw, INFO skip when `cacheKey` is null — is
  // pinned non-tautologically in
  // `tests/unit/chat/feedback-cache-invalidation.test.ts` (the RED/GREEN
  // suite for this fix). See `team-state/2026-05-23-pr-p0-1-fix-llm-cache-feedback/`.
});
