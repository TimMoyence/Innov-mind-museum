/**
 * Bug fix `merged_bug_004` (ultrareview cloud, chantier chat-ux-refonte) —
 * `chat.phase.composing` and `chat.phase.analyzing-image` Langfuse spans MUST
 * be emitted on BOTH success AND failure paths, carrying an
 * `outcome: 'success' | 'error'` attribute. Mirrors the sibling
 * `synthesizing-voice` pattern shipped in the same A5 PR at
 * `text-to-speech.openai.ts:115-132`.
 *
 * Before the fix : both sites emit the span AFTER the `await` succeeds, so any
 * LLM 503 / circuit-open / timeout (composing) or any `processImage` reject
 * (analyzing-image) silently drops the trace — exactly the window engineers
 * need most.
 *
 * Strategy : mock `emitChatPhaseSpan` directly so the assertions can inspect
 * the `metadata` payload (not just labels — outcome ladder matters here).
 */

import { ChatMessageService } from '@modules/chat/useCase/message/chat-message.service';
import type { ChatMessageServiceDeps } from '@modules/chat/useCase/message/chat-message.service';
import type {
  ChatRepository,
  SessionMessagesPage,
  ChatSessionsPage,
} from '@modules/chat/domain/session/chat.repository.interface';
import type { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import type {
  ChatOrchestrator,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { ImageStorage } from '@modules/chat/domain/ports/image-storage.port';
import type { ImageProcessorPort } from '@modules/chat/adapters/secondary/image/image-processing.service';
import { AppError } from '@shared/errors/app.error';

import { makeSession, makeMessage, makeSessionUser } from '../../helpers/chat/message.fixtures';
import { makeChatRepo } from '../../helpers/chat/repo.fixtures';
import { makeCache } from '../../helpers/chat/cache.fixtures';

// Mock `emitChatPhaseSpan` so we can inspect (phase, startedAtMs, metadata)
// triples — labels alone are not sufficient (we need `outcome`).
interface SpanCall {
  phase: string;
  startedAtMs: number;
  metadata: Record<string, unknown>;
}
jest.mock('@shared/observability/chat-phase-span', () => {
  const recordedCalls: SpanCall[] = [];
  return {
    emitChatPhaseSpan: jest.fn(
      (phase: string, startedAtMs: number, metadata: Record<string, unknown> = {}) => {
        recordedCalls.push({ phase, startedAtMs, metadata });
      },
    ),
    __getRecordedCalls: () => recordedCalls,
    __resetRecordedCalls: () => {
      recordedCalls.length = 0;
    },
  };
});

interface ChatPhaseSpanMockHelpers {
  __getRecordedCalls: () => SpanCall[];
  __resetRecordedCalls: () => void;
}
const spanMock: ChatPhaseSpanMockHelpers = jest.requireMock(
  '@shared/observability/chat-phase-span',
) as unknown as ChatPhaseSpanMockHelpers;

const SESSION_ID = 'b1b1b1b1-c2c2-4d3d-9e4e-f5f5f5f5f5f5';
const USER_ID = 99;

const makeArtOutput = (): OrchestratorOutput => ({
  text: 'A short factual description of Monet.',
  metadata: {
    detectedArtwork: { title: 'Water Lilies', artist: 'Monet', confidence: 0.9, source: 'test' },
    citations: ['catalog'],
  },
});

const makeRepo = (
  session: ChatSession | null = makeSession({ id: SESSION_ID, user: makeSessionUser(USER_ID) }),
): jest.Mocked<ChatRepository> =>
  makeChatRepo({
    createSession: jest.fn().mockResolvedValue(session),
    getSessionById: jest.fn().mockResolvedValue(session),
    getMessageById: jest.fn().mockResolvedValue(null),
    deleteSessionIfEmpty: jest.fn().mockResolvedValue(true),
    persistMessage: jest.fn().mockResolvedValue(makeMessage({ role: 'assistant' })),
    persistBlockedExchange: jest.fn().mockResolvedValue({
      userMessage: makeMessage({ id: 'msg-user-blocked', role: 'user' }),
      refusal: makeMessage({ id: 'msg-assistant-refusal', role: 'assistant' }),
    }),
    listSessionMessages: jest.fn().mockResolvedValue({
      messages: [],
      nextCursor: null,
      hasMore: false,
    } satisfies SessionMessagesPage),
    listSessionHistory: jest.fn().mockResolvedValue([]),
    listSessions: jest.fn().mockResolvedValue({
      sessions: [],
      nextCursor: null,
      hasMore: false,
    } satisfies ChatSessionsPage),
  });

const makeOrchestrator = (
  override?: Partial<jest.Mocked<ChatOrchestrator>>,
): jest.Mocked<ChatOrchestrator> => ({
  generate: jest.fn().mockResolvedValue(makeArtOutput()),
  generateStream: jest.fn().mockResolvedValue(makeArtOutput()),
  ...override,
});

const makeImageStorage = (): jest.Mocked<ImageStorage> => ({
  save: jest.fn().mockResolvedValue('local://test-image.jpg'),
  deleteByPrefix: jest.fn().mockResolvedValue(undefined),
});

/**
 * Builds an ImageProcessorPort that either succeeds (stripExif returns a tiny
 * 1×1 cleaned PNG) or rejects with the supplied error. Triggers the
 * `analyzing-image` failure path INSIDE `ImageProcessingService.processImage`
 * without needing real sharp / EXIF work.
 * @param behaviour
 */
const makeImageProcessor = (
  behaviour: { mode: 'reject'; error: Error } | { mode: 'resolve' },
): ImageProcessorPort => ({
  stripExif:
    behaviour.mode === 'reject'
      ? jest.fn().mockRejectedValue(behaviour.error)
      : jest.fn().mockResolvedValue({
          buffer: Buffer.from('cleaned'),
          mime: 'image/png',
          width: 1,
          height: 1,
        }),
});

const buildService = (
  overrides: Partial<ChatMessageServiceDeps> = {},
): { service: ChatMessageService } => {
  const repo = (overrides.repository as jest.Mocked<ChatRepository>) ?? makeRepo();
  const orchestrator =
    (overrides.orchestrator as jest.Mocked<ChatOrchestrator>) ?? makeOrchestrator();
  const imageStorage = (overrides.imageStorage as jest.Mocked<ImageStorage>) ?? makeImageStorage();
  const cache = (overrides.cache as jest.Mocked<unknown>) ?? makeCache();

  const service = new ChatMessageService({
    repository: repo,
    orchestrator,
    imageStorage,
    cache: cache as ChatMessageServiceDeps['cache'],
    ...overrides,
  });
  return { service };
};

// 1×1 transparent PNG (valid magic bytes — survives `assertMagicBytes`).
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('merged_bug_004 — chat.phase.* spans on failure paths', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    spanMock.__resetRecordedCalls();
  });

  describe('composing — span emitted with outcome attribute', () => {
    it('emits chat.phase.composing with outcome="success" on happy path', async () => {
      const { service } = buildService();

      await service.postMessage(SESSION_ID, { text: 'compose ok' }, 'req-cs-1', USER_ID);

      const composing = spanMock.__getRecordedCalls().find((c) => c.phase === 'composing');
      expect(composing).toBeDefined();
      expect(composing?.metadata.outcome).toBe('success');
    });

    it('emits chat.phase.composing with outcome="error" when orchestrator.generate rejects (LLM 503 / circuit-open / timeout)', async () => {
      const orchestrator = makeOrchestrator({
        generate: jest.fn().mockRejectedValue(
          new AppError({
            message: 'circuit open',
            statusCode: 503,
            code: 'UPSTREAM_UNAVAILABLE',
          }),
        ),
      });
      const { service } = buildService({ orchestrator });

      await expect(
        service.postMessage(SESSION_ID, { text: 'boom' }, 'req-cs-2', USER_ID),
      ).rejects.toBeInstanceOf(Error);

      const composing = spanMock.__getRecordedCalls().find((c) => c.phase === 'composing');
      expect(composing).toBeDefined();
      expect(composing?.metadata.outcome).toBe('error');
    });

    it('records a positive durationMs on the composing span in BOTH outcomes (time-to-failure is useful)', async () => {
      // success
      const { service: okService } = buildService();
      await okService.postMessage(SESSION_ID, { text: 'ok' }, 'req-cs-3a', USER_ID);
      const okSpan = spanMock.__getRecordedCalls().find((c) => c.phase === 'composing');
      expect(okSpan).toBeDefined();
      // startedAtMs is captured BEFORE the await — startedAtMs <= now.
      expect(typeof okSpan?.startedAtMs).toBe('number');
      expect(okSpan?.startedAtMs).toBeGreaterThan(0);
      expect(okSpan?.startedAtMs).toBeLessThanOrEqual(Date.now());

      // error
      spanMock.__resetRecordedCalls();
      const orchestrator = makeOrchestrator({
        generate: jest.fn().mockRejectedValue(new Error('timeout')),
      });
      const { service: errService } = buildService({ orchestrator });
      await expect(
        errService.postMessage(SESSION_ID, { text: 'fail' }, 'req-cs-3b', USER_ID),
      ).rejects.toBeInstanceOf(Error);
      const errSpan = spanMock.__getRecordedCalls().find((c) => c.phase === 'composing');
      expect(errSpan).toBeDefined();
      expect(typeof errSpan?.startedAtMs).toBe('number');
      expect(errSpan?.startedAtMs).toBeGreaterThan(0);
      expect(errSpan?.startedAtMs).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('analyzing-image — span emitted with outcome attribute', () => {
    it('emits chat.phase.analyzing-image with outcome="success" when processImage succeeds', async () => {
      const { service } = buildService({
        imageProcessor: makeImageProcessor({ mode: 'resolve' }),
      });

      await service.postMessage(
        SESSION_ID,
        {
          text: 'with image',
          image: {
            source: 'upload',
            value: TINY_PNG_B64,
            mimeType: 'image/png',
            sizeBytes: 64,
          },
        },
        'req-ai-1',
        USER_ID,
      );

      const analyzing = spanMock.__getRecordedCalls().find((c) => c.phase === 'analyzing-image');
      expect(analyzing).toBeDefined();
      expect(analyzing?.metadata.outcome).toBe('success');
    });

    it('emits chat.phase.analyzing-image with outcome="error" when processImage rejects (sharp EXIF-strip failure / S3 upload error)', async () => {
      // Reject inside `stripExif` — this propagates out of `processImage`.
      const { service } = buildService({
        imageProcessor: makeImageProcessor({
          mode: 'reject',
          error: new AppError({
            message: 'EXIF strip failed',
            statusCode: 400,
            code: 'IMAGE_DECODE_FAILED',
          }),
        }),
      });

      await expect(
        service.postMessage(
          SESSION_ID,
          {
            text: 'broken image',
            image: {
              source: 'upload',
              value: TINY_PNG_B64,
              mimeType: 'image/png',
              sizeBytes: 64,
            },
          },
          'req-ai-2',
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(Error);

      const analyzing = spanMock.__getRecordedCalls().find((c) => c.phase === 'analyzing-image');
      expect(analyzing).toBeDefined();
      expect(analyzing?.metadata.outcome).toBe('error');
    });

    it('records a positive durationMs on the analyzing-image span in BOTH outcomes', async () => {
      // success
      const { service: okService } = buildService({
        imageProcessor: makeImageProcessor({ mode: 'resolve' }),
      });
      await okService.postMessage(
        SESSION_ID,
        {
          text: 'ok img',
          image: {
            source: 'upload',
            value: TINY_PNG_B64,
            mimeType: 'image/png',
            sizeBytes: 64,
          },
        },
        'req-ai-3a',
        USER_ID,
      );
      const okSpan = spanMock.__getRecordedCalls().find((c) => c.phase === 'analyzing-image');
      expect(okSpan).toBeDefined();
      expect(typeof okSpan?.startedAtMs).toBe('number');
      expect(okSpan?.startedAtMs).toBeGreaterThan(0);
      expect(okSpan?.startedAtMs).toBeLessThanOrEqual(Date.now());

      // error
      spanMock.__resetRecordedCalls();
      const { service: errService } = buildService({
        imageProcessor: makeImageProcessor({
          mode: 'reject',
          error: new Error('S3 down'),
        }),
      });
      await expect(
        errService.postMessage(
          SESSION_ID,
          {
            text: 'broken',
            image: {
              source: 'upload',
              value: TINY_PNG_B64,
              mimeType: 'image/png',
              sizeBytes: 64,
            },
          },
          'req-ai-3b',
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(Error);
      const errSpan = spanMock.__getRecordedCalls().find((c) => c.phase === 'analyzing-image');
      expect(errSpan).toBeDefined();
      expect(typeof errSpan?.startedAtMs).toBe('number');
      expect(errSpan?.startedAtMs).toBeGreaterThan(0);
      expect(errSpan?.startedAtMs).toBeLessThanOrEqual(Date.now());
    });
  });
});
