import { ChatService } from '@modules/chat/application/chat.service';
import { ChatSessionService } from '@modules/chat/application/chat-session.service';
import { ChatMessageService } from '@modules/chat/application/chat-message.service';
import { ChatMediaService } from '@modules/chat/application/chat-media.service';
import type { ChatServiceDeps } from '@modules/chat/application/chat.service';
import type {
  CreateSessionResult,
  DeleteSessionResult,
  ListSessionsResult,
  PostAudioMessageResult,
  PostMessageResult,
  ReportMessageResult,
  SessionResult,
} from '@modules/chat/application/chat.service.types';
import type { ChatRepository } from '@modules/chat/domain/chat.repository.interface';
import type { AudioTranscriber } from '@modules/chat/domain/ports/audio-transcriber.port';
import type { ChatOrchestrator } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { ImageStorage } from '@modules/chat/domain/ports/image-storage.port';
import type { TextToSpeechService } from '@modules/chat/domain/ports/tts.port';
import type { GuardrailBlockReason } from '@modules/chat/application/art-topic-guardrail';
import type { CacheService } from '@shared/cache/cache.port';

// ── Mock sub-services so ChatService delegates without executing real logic ──

jest.mock('@modules/chat/application/chat-session.service');
jest.mock('@modules/chat/application/chat-message.service');
jest.mock('@modules/chat/application/chat-media.service');

const MockedSessionService = ChatSessionService as jest.MockedClass<typeof ChatSessionService>;
const MockedMessageService = ChatMessageService as jest.MockedClass<typeof ChatMessageService>;
const MockedMediaService = ChatMediaService as jest.MockedClass<typeof ChatMediaService>;

// ── Factories ──────────────────────────────────────────────────────────

const makeRepo = (): ChatRepository =>
  ({
    createSession: jest.fn(),
    getSessionById: jest.fn(),
    getMessageById: jest.fn(),
    deleteSessionIfEmpty: jest.fn(),
    persistMessage: jest.fn(),
    listSessionMessages: jest.fn(),
    listSessionHistory: jest.fn(),
    listSessions: jest.fn(),
    hasMessageReport: jest.fn(),
    persistMessageReport: jest.fn(),
    exportUserData: jest.fn(),
    upsertMessageFeedback: jest.fn(),
    deleteMessageFeedback: jest.fn(),
    getMessageFeedback: jest.fn(),
  }) as unknown as ChatRepository;

const makeOrchestrator = (): ChatOrchestrator => ({
  generate: jest.fn(),
  generateStream: jest.fn(),
});

const makeImageStorage = (): ImageStorage => ({
  save: jest.fn(),
  deleteByPrefix: jest.fn(),
});

const makeTts = (): TextToSpeechService => ({
  synthesize: jest.fn(),
});

const makeDeps = (overrides: Partial<ChatServiceDeps> = {}): ChatServiceDeps => ({
  repository: makeRepo(),
  orchestrator: makeOrchestrator(),
  imageStorage: makeImageStorage(),
  ...overrides,
});

/**
 * Creates a ChatService and returns its mocked sub-service instances.
 * @param overrides
 */
function buildService(overrides: Partial<ChatServiceDeps> = {}) {
  const deps = makeDeps(overrides);
  const service = new ChatService(deps);

  // The constructor instantiates sub-services — grab the mock instances
  const sessionsSvc = MockedSessionService.mock.instances.at(-1)!;
  const messagesSvc = MockedMessageService.mock.instances.at(-1)!;
  const mediaSvc = MockedMediaService.mock.instances.at(-1)!;

  return { service, deps, sessionsSvc, messagesSvc, mediaSvc };
}

// ── Stub results ──────────────────────────────────────────────────────

const STUB_SESSION: CreateSessionResult = {
  id: 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4',
  locale: 'en',
  museumMode: false,
  title: null,
  museumName: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const STUB_SESSION_RESULT: SessionResult = {
  session: STUB_SESSION,
  messages: [],
  page: { nextCursor: null, hasMore: false, limit: 20 },
};

const STUB_LIST_SESSIONS: ListSessionsResult = {
  sessions: [],
  page: { nextCursor: null, hasMore: false, limit: 20 },
};

const STUB_DELETE: DeleteSessionResult = {
  sessionId: STUB_SESSION.id,
  deleted: true,
};

const STUB_POST_MESSAGE: PostMessageResult = {
  sessionId: STUB_SESSION.id,
  message: {
    id: 'msg-001',
    role: 'assistant',
    text: 'This painting is by Monet.',
    createdAt: '2026-01-01T00:01:00.000Z',
  },
  metadata: { citations: ['catalog'] },
};

const STUB_POST_AUDIO: PostAudioMessageResult = {
  ...STUB_POST_MESSAGE,
  transcription: { text: 'Tell me about this painting', model: 'whisper-1', provider: 'openai' },
};

const STUB_REPORT: ReportMessageResult = {
  messageId: 'msg-001',
  reported: true,
};

const STUB_IMAGE_REF = {
  imageRef: 'local://photo-001.jpg',
  fileName: 'photo-001.jpg',
  contentType: 'image/jpeg',
};

const STUB_SPEECH = { audio: Buffer.from('fake-audio'), contentType: 'audio/mpeg' };

// ── Tests ──────────────────────────────────────────────────────────────

describe('ChatService (facade)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockedSessionService.mockClear();
    MockedMessageService.mockClear();
    MockedMediaService.mockClear();
  });

  // ── Constructor wiring ────────────────────────────────────────────────

  describe('constructor', () => {
    it('instantiates all three sub-services', () => {
      buildService();

      expect(MockedSessionService).toHaveBeenCalledTimes(1);
      expect(MockedMessageService).toHaveBeenCalledTimes(1);
      expect(MockedMediaService).toHaveBeenCalledTimes(1);
    });

    it('passes repository and cache to ChatSessionService', () => {
      const repo = makeRepo();
      const cache = {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        delByPrefix: jest.fn(),
        setNx: jest.fn(),
        ping: jest.fn(),
      };
      buildService({ repository: repo, cache: cache as unknown as CacheService });

      expect(MockedSessionService).toHaveBeenCalledWith(
        expect.objectContaining({ repository: repo, cache }),
      );
    });

    it('passes orchestrator, imageStorage, and optional deps to ChatMessageService', () => {
      const repo = makeRepo();
      const orchestrator = makeOrchestrator();
      const imageStorage = makeImageStorage();
      buildService({ repository: repo, orchestrator, imageStorage });

      expect(MockedMessageService).toHaveBeenCalledWith(
        expect.objectContaining({ repository: repo, orchestrator, imageStorage }),
      );
    });

    it('passes repository and tts to ChatMediaService', () => {
      const repo = makeRepo();
      const tts = makeTts();
      buildService({ repository: repo, tts });

      expect(MockedMediaService).toHaveBeenCalledWith(
        expect.objectContaining({ repository: repo, tts }),
      );
    });

    it('uses DisabledAudioTranscriber when none provided', () => {
      buildService({ audioTranscriber: undefined });

      const msgDeps = MockedMessageService.mock.calls.at(-1)![0] as unknown as Record<
        string,
        unknown
      >;
      expect(msgDeps.audioTranscriber).not.toBeNull();
      expect((msgDeps.audioTranscriber as { constructor: { name: string } }).constructor.name).toBe(
        'DisabledAudioTranscriber',
      );
    });

    it('uses provided audioTranscriber when supplied', () => {
      const transcriber = { transcribe: jest.fn() };
      buildService({ audioTranscriber: transcriber as unknown as AudioTranscriber });

      const msgDeps = MockedMessageService.mock.calls.at(-1)![0] as unknown as Record<
        string,
        unknown
      >;
      expect(msgDeps.audioTranscriber).toBe(transcriber);
    });
  });

  // ── Session CRUD delegation ───────────────────────────────────────────

  describe('createSession', () => {
    it('delegates to sessions sub-service and returns its result', async () => {
      const { service, sessionsSvc } = buildService();
      (sessionsSvc.createSession as jest.Mock).mockResolvedValue(STUB_SESSION);

      const input = { userId: 42, locale: 'fr', museumMode: true };
      const result = await service.createSession(input);

      expect(sessionsSvc.createSession).toHaveBeenCalledWith(input);
      expect(result).toBe(STUB_SESSION);
    });

    it('propagates errors from session sub-service', async () => {
      const { service, sessionsSvc } = buildService();
      const error = new Error('session creation failed');
      (sessionsSvc.createSession as jest.Mock).mockRejectedValue(error);

      await expect(service.createSession({ userId: -1 })).rejects.toThrow(
        'session creation failed',
      );
    });
  });

  describe('getSession', () => {
    it('delegates sessionId, page, and currentUserId', async () => {
      const { service, sessionsSvc } = buildService();
      (sessionsSvc.getSession as jest.Mock).mockResolvedValue(STUB_SESSION_RESULT);

      const result = await service.getSession(STUB_SESSION.id, { limit: 20 }, 42);

      expect(sessionsSvc.getSession).toHaveBeenCalledWith(STUB_SESSION.id, { limit: 20 }, 42);
      expect(result).toBe(STUB_SESSION_RESULT);
    });

    it('works without currentUserId (anonymous access)', async () => {
      const { service, sessionsSvc } = buildService();
      (sessionsSvc.getSession as jest.Mock).mockResolvedValue(STUB_SESSION_RESULT);

      await service.getSession(STUB_SESSION.id, { limit: 10 });

      expect(sessionsSvc.getSession).toHaveBeenCalledWith(
        STUB_SESSION.id,
        { limit: 10 },
        undefined,
      );
    });

    it('propagates 404 errors', async () => {
      const { service, sessionsSvc } = buildService();
      const notFound = Object.assign(new Error('Not found'), { statusCode: 404 });
      (sessionsSvc.getSession as jest.Mock).mockRejectedValue(notFound);

      await expect(service.getSession('bad-id', { limit: 20 })).rejects.toThrow('Not found');
    });
  });

  describe('listSessions', () => {
    it('delegates page and currentUserId', async () => {
      const { service, sessionsSvc } = buildService();
      (sessionsSvc.listSessions as jest.Mock).mockResolvedValue(STUB_LIST_SESSIONS);

      const result = await service.listSessions({ limit: 10, cursor: 'abc' }, 42);

      expect(sessionsSvc.listSessions).toHaveBeenCalledWith({ limit: 10, cursor: 'abc' }, 42);
      expect(result).toBe(STUB_LIST_SESSIONS);
    });

    it('propagates errors when no userId', async () => {
      const { service, sessionsSvc } = buildService();
      const error = Object.assign(new Error('userId required'), { statusCode: 400 });
      (sessionsSvc.listSessions as jest.Mock).mockRejectedValue(error);

      await expect(service.listSessions({ limit: 20 })).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('deleteSessionIfEmpty', () => {
    it('delegates sessionId and currentUserId', async () => {
      const { service, sessionsSvc } = buildService();
      (sessionsSvc.deleteSessionIfEmpty as jest.Mock).mockResolvedValue(STUB_DELETE);

      const result = await service.deleteSessionIfEmpty(STUB_SESSION.id, 42);

      expect(sessionsSvc.deleteSessionIfEmpty).toHaveBeenCalledWith(STUB_SESSION.id, 42);
      expect(result).toBe(STUB_DELETE);
    });

    it('propagates 404 when session not found', async () => {
      const { service, sessionsSvc } = buildService();
      const notFound = Object.assign(new Error('Not found'), { statusCode: 404 });
      (sessionsSvc.deleteSessionIfEmpty as jest.Mock).mockRejectedValue(notFound);

      await expect(service.deleteSessionIfEmpty('missing-id', 42)).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  // ── Message posting delegation ────────────────────────────────────────

  describe('postMessage', () => {
    it('delegates all parameters to message sub-service', async () => {
      const { service, messagesSvc } = buildService();
      (messagesSvc.postMessage as jest.Mock).mockResolvedValue(STUB_POST_MESSAGE);

      const input = { text: 'Tell me about this painting' };
      const result = await service.postMessage(STUB_SESSION.id, input, 'req-1', 42);

      expect(messagesSvc.postMessage).toHaveBeenCalledWith(STUB_SESSION.id, input, 'req-1', 42);
      expect(result).toBe(STUB_POST_MESSAGE);
    });

    it('works with minimal parameters (no requestId, no userId)', async () => {
      const { service, messagesSvc } = buildService();
      (messagesSvc.postMessage as jest.Mock).mockResolvedValue(STUB_POST_MESSAGE);

      await service.postMessage(STUB_SESSION.id, { text: 'Hello' });

      expect(messagesSvc.postMessage).toHaveBeenCalledWith(
        STUB_SESSION.id,
        { text: 'Hello' },
        undefined,
        undefined,
      );
    });

    it('propagates orchestrator errors', async () => {
      const { service, messagesSvc } = buildService();
      (messagesSvc.postMessage as jest.Mock).mockRejectedValue(new Error('LLM exploded'));

      await expect(service.postMessage(STUB_SESSION.id, { text: 'Hello' })).rejects.toThrow(
        'LLM exploded',
      );
    });
  });

  describe('postMessageStream', () => {
    it('delegates all parameters including callbacks', async () => {
      const { service, messagesSvc } = buildService();
      (messagesSvc.postMessageStream as jest.Mock).mockResolvedValue(STUB_POST_MESSAGE);

      const onToken = jest.fn();
      const onGuardrail = jest.fn() as jest.Mock<void, [string, GuardrailBlockReason]>;
      const signal = new AbortController().signal;
      const result = await service.postMessageStream(
        STUB_SESSION.id,
        { text: 'Describe this painting' },
        {
          onToken,
          onGuardrail,
          requestId: 'req-stream-1',
          currentUserId: 42,
          signal,
        },
      );

      expect(messagesSvc.postMessageStream).toHaveBeenCalledWith(
        STUB_SESSION.id,
        { text: 'Describe this painting' },
        {
          onToken,
          onGuardrail,
          requestId: 'req-stream-1',
          currentUserId: 42,
          signal,
        },
      );
      expect(result).toBe(STUB_POST_MESSAGE);
    });

    it('works with only required parameters', async () => {
      const { service, messagesSvc } = buildService();
      (messagesSvc.postMessageStream as jest.Mock).mockResolvedValue(STUB_POST_MESSAGE);

      const onToken = jest.fn();
      await service.postMessageStream(STUB_SESSION.id, { text: 'Hello' }, { onToken });

      expect(messagesSvc.postMessageStream).toHaveBeenCalledWith(
        STUB_SESSION.id,
        { text: 'Hello' },
        { onToken },
      );
    });

    it('propagates streaming errors', async () => {
      const { service, messagesSvc } = buildService();
      (messagesSvc.postMessageStream as jest.Mock).mockRejectedValue(new Error('stream failed'));

      await expect(
        service.postMessageStream(STUB_SESSION.id, { text: 'Hello' }, { onToken: jest.fn() }),
      ).rejects.toThrow('stream failed');
    });
  });

  describe('postAudioMessage', () => {
    it('delegates all parameters to message sub-service', async () => {
      const { service, messagesSvc } = buildService();
      (messagesSvc.postAudioMessage as jest.Mock).mockResolvedValue(STUB_POST_AUDIO);

      const input = { audio: { base64: 'AAAA', mimeType: 'audio/mpeg', sizeBytes: 1024 } };
      const result = await service.postAudioMessage(STUB_SESSION.id, input, 'req-audio-1', 42);

      expect(messagesSvc.postAudioMessage).toHaveBeenCalledWith(
        STUB_SESSION.id,
        input,
        'req-audio-1',
        42,
      );
      expect(result).toBe(STUB_POST_AUDIO);
    });

    it('works without requestId and userId', async () => {
      const { service, messagesSvc } = buildService();
      (messagesSvc.postAudioMessage as jest.Mock).mockResolvedValue(STUB_POST_AUDIO);

      const input = { audio: { base64: 'AAAA', mimeType: 'audio/wav', sizeBytes: 512 } };
      await service.postAudioMessage(STUB_SESSION.id, input);

      expect(messagesSvc.postAudioMessage).toHaveBeenCalledWith(
        STUB_SESSION.id,
        input,
        undefined,
        undefined,
      );
    });

    it('propagates transcription errors', async () => {
      const { service, messagesSvc } = buildService();
      const error = Object.assign(new Error('Audio transcription disabled'), {
        statusCode: 501,
        code: 'FEATURE_UNAVAILABLE',
      });
      (messagesSvc.postAudioMessage as jest.Mock).mockRejectedValue(error);

      const input = { audio: { base64: 'AAAA', mimeType: 'audio/mpeg', sizeBytes: 1024 } };
      await expect(service.postAudioMessage(STUB_SESSION.id, input)).rejects.toMatchObject({
        statusCode: 501,
        code: 'FEATURE_UNAVAILABLE',
      });
    });
  });

  // ── Media & reporting delegation ──────────────────────────────────────

  describe('getMessageImageRef', () => {
    it('delegates messageId and currentUserId', async () => {
      const { service, mediaSvc } = buildService();
      (mediaSvc.getMessageImageRef as jest.Mock).mockResolvedValue(STUB_IMAGE_REF);

      const result = await service.getMessageImageRef('msg-001', 42);

      expect(mediaSvc.getMessageImageRef).toHaveBeenCalledWith('msg-001', 42);
      expect(result).toBe(STUB_IMAGE_REF);
    });

    it('works without currentUserId', async () => {
      const { service, mediaSvc } = buildService();
      (mediaSvc.getMessageImageRef as jest.Mock).mockResolvedValue(STUB_IMAGE_REF);

      await service.getMessageImageRef('msg-001');

      expect(mediaSvc.getMessageImageRef).toHaveBeenCalledWith('msg-001', undefined);
    });

    it('propagates 404 when message has no image', async () => {
      const { service, mediaSvc } = buildService();
      const notFound = Object.assign(new Error('Image not found'), { statusCode: 404 });
      (mediaSvc.getMessageImageRef as jest.Mock).mockRejectedValue(notFound);

      await expect(service.getMessageImageRef('msg-001', 42)).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('reportMessage', () => {
    it('delegates all parameters to media sub-service', async () => {
      const { service, mediaSvc } = buildService();
      (mediaSvc.reportMessage as jest.Mock).mockResolvedValue(STUB_REPORT);

      const result = await service.reportMessage('msg-001', 'offensive', 42, 'rude content');

      expect(mediaSvc.reportMessage).toHaveBeenCalledWith(
        'msg-001',
        'offensive',
        42,
        'rude content',
      );
      expect(result).toBe(STUB_REPORT);
    });

    it('works without optional comment', async () => {
      const { service, mediaSvc } = buildService();
      (mediaSvc.reportMessage as jest.Mock).mockResolvedValue(STUB_REPORT);

      await service.reportMessage('msg-001', 'inaccurate', 42);

      expect(mediaSvc.reportMessage).toHaveBeenCalledWith('msg-001', 'inaccurate', 42, undefined);
    });

    it('propagates 400 when reporting a user message', async () => {
      const { service, mediaSvc } = buildService();
      const badReq = Object.assign(new Error('Cannot report user messages'), { statusCode: 400 });
      (mediaSvc.reportMessage as jest.Mock).mockRejectedValue(badReq);

      await expect(service.reportMessage('msg-001', 'offensive', 42)).rejects.toMatchObject({
        statusCode: 400,
      });
    });
  });

  describe('synthesizeSpeech', () => {
    it('delegates messageId and currentUserId', async () => {
      const { service, mediaSvc } = buildService();
      (mediaSvc.synthesizeSpeech as jest.Mock).mockResolvedValue(STUB_SPEECH);

      const result = await service.synthesizeSpeech('msg-001', 42);

      expect(mediaSvc.synthesizeSpeech).toHaveBeenCalledWith('msg-001', 42);
      expect(result).toBe(STUB_SPEECH);
    });

    it('works without currentUserId', async () => {
      const { service, mediaSvc } = buildService();
      (mediaSvc.synthesizeSpeech as jest.Mock).mockResolvedValue(STUB_SPEECH);

      await service.synthesizeSpeech('msg-001');

      expect(mediaSvc.synthesizeSpeech).toHaveBeenCalledWith('msg-001', undefined);
    });

    it('returns null when message has no text', async () => {
      const { service, mediaSvc } = buildService();
      (mediaSvc.synthesizeSpeech as jest.Mock).mockResolvedValue(null);

      const result = await service.synthesizeSpeech('msg-001', 42);

      expect(result).toBeNull();
    });

    it('propagates 501 when TTS is not configured', async () => {
      const { service, mediaSvc } = buildService();
      const unavailable = Object.assign(new Error('TTS unavailable'), {
        statusCode: 501,
        code: 'FEATURE_UNAVAILABLE',
      });
      (mediaSvc.synthesizeSpeech as jest.Mock).mockRejectedValue(unavailable);

      await expect(service.synthesizeSpeech('msg-001', 42)).rejects.toMatchObject({
        statusCode: 501,
        code: 'FEATURE_UNAVAILABLE',
      });
    });
  });

  describe('setMessageFeedback', () => {
    it('delegates messageId, currentUserId and value', async () => {
      const { service, mediaSvc } = buildService();
      (mediaSvc.setMessageFeedback as jest.Mock).mockResolvedValue({
        messageId: 'msg-001',
        status: 'created',
      });

      const result = await service.setMessageFeedback('msg-001', 42, 'positive');

      expect(mediaSvc.setMessageFeedback).toHaveBeenCalledWith('msg-001', 42, 'positive');
      expect(result).toEqual({ messageId: 'msg-001', status: 'created' });
    });

    it('passes negative value through', async () => {
      const { service, mediaSvc } = buildService();
      (mediaSvc.setMessageFeedback as jest.Mock).mockResolvedValue({
        messageId: 'msg-001',
        status: 'created',
      });

      await service.setMessageFeedback('msg-001', 42, 'negative');

      expect(mediaSvc.setMessageFeedback).toHaveBeenCalledWith('msg-001', 42, 'negative');
    });
  });
});
