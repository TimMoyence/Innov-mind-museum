import { ChatMediaService } from '@modules/chat/application/chat-media.service';
import type {
  ChatRepository,
  ChatMessageWithSessionOwnership,
} from '@modules/chat/domain/chat.repository.interface';
import type { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import type { ChatSession } from '@modules/chat/domain/chatSession.entity';
import type { TextToSpeechService } from '@modules/chat/domain/ports/tts.port';
import type { CacheService } from '@shared/cache/cache.port';

// ── Factories ──────────────────────────────────────────────────────────

const SESSION_ID = 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4';
const MESSAGE_ID = 'b1b1b1b1-c2c2-4d3d-9e4e-f5f5f5f5f5f5';

const makeSession = (overrides: Partial<ChatSession> = {}): ChatSession =>
  ({
    id: SESSION_ID,
    locale: 'en',
    museumMode: false,
    title: null,
    museumName: null,
    messages: [],
    version: 1,
    user: { id: 42 },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }) as ChatSession;

const makeMessage = (overrides: Partial<ChatMessage> = {}): ChatMessage =>
  ({
    id: MESSAGE_ID,
    role: 'assistant',
    text: 'This is a painting by Monet.',
    imageRef: null,
    metadata: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    session: makeSession(),
    artworkMatches: [],
    ...overrides,
  }) as ChatMessage;

const makeMessageRow = (
  msgOverrides: Partial<ChatMessage> = {},
  sessionOverrides: Partial<ChatSession> = {},
): ChatMessageWithSessionOwnership => {
  const session = makeSession(sessionOverrides);
  const message = makeMessage({ ...msgOverrides, session });
  return { message, session };
};

const makeRepo = (
  messageRow: ChatMessageWithSessionOwnership | null = makeMessageRow(),
): jest.Mocked<ChatRepository> => ({
  createSession: jest.fn(),
  getSessionById: jest.fn(),
  getMessageById: jest.fn().mockResolvedValue(messageRow),
  deleteSessionIfEmpty: jest.fn(),
  persistMessage: jest.fn(),
  listSessionMessages: jest.fn(),
  listSessionHistory: jest.fn(),
  listSessions: jest.fn(),
  hasMessageReport: jest.fn().mockResolvedValue(false),
  persistMessageReport: jest.fn().mockResolvedValue(undefined),
  exportUserData: jest.fn(),
  upsertMessageFeedback: jest.fn().mockResolvedValue(undefined),
  deleteMessageFeedback: jest.fn().mockResolvedValue(undefined),
  getMessageFeedback: jest.fn().mockResolvedValue(null),
});

const makeTts = (): jest.Mocked<TextToSpeechService> => ({
  synthesize: jest.fn().mockResolvedValue({
    audio: Buffer.from('fake-audio'),
    contentType: 'audio/mpeg',
  }),
});

const makeCache = (): jest.Mocked<CacheService> => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  delByPrefix: jest.fn().mockResolvedValue(undefined),
  setNx: jest.fn().mockResolvedValue(true),
  ping: jest.fn().mockResolvedValue(true),
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
      expect(result!.contentType).toBe('audio/mpeg');
      expect(tts.synthesize).toHaveBeenCalledWith({ text: 'Hello world' });
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
        contentType: 'audio/mpeg',
      });
      const svc = new ChatMediaService({ repository: repo, tts, cache });

      const result = await svc.synthesizeSpeech(MESSAGE_ID, 42);

      expect(result).not.toBeNull();
      expect(result!.contentType).toBe('audio/mpeg');
      expect(tts.synthesize).not.toHaveBeenCalled();
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
});
