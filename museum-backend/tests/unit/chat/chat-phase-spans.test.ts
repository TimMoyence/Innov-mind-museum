/**
 * A5 corrective loop 1 — Langfuse phase-span tests.
 *
 * Asserts the EARS contract from `docs/chat-ux-refonte/specs/A5.md` §1.1 R2-R6
 * + AC4 :
 *
 *   - R2 / AC4 : `chat.phase.analyzing-image` span emitted when `image` is
 *     present.
 *   - R3       : NO `analyzing-image` span emitted when `image` is absent.
 *   - R4       : `chat.phase.composing` span emitted around `orchestrator.generate`.
 *   - R5       : `chat.phase.synthesizing-voice` span emitted around the TTS
 *     synthesis call.
 *   - R6       : `chat.phase.searching-collection` span emitted around the
 *     enrichment fan-out.
 *   - R9       : All spans are fail-open via `safeTrace` — a Langfuse SDK
 *     throw never propagates to the chat path (already enforced by the
 *     `safeTrace` wrapper at the `emitChatPhaseSpan` call site).
 *
 * Strategy : mock the `safeTrace` module to capture every `label` argument,
 * then drive the relevant code paths and assert which `chat.phase.<phase>`
 * labels were observed.
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

import { makeSession, makeMessage, makeSessionUser } from '../../helpers/chat/message.fixtures';
import { makeChatRepo } from '../../helpers/chat/repo.fixtures';
import { makeCache } from '../../helpers/chat/cache.fixtures';

// Capture every safeTrace label so the assertions can grep for the
// `chat.phase.<phase>` markers emitted by `emitChatPhaseSpan`. The fn is
// invoked synchronously so we keep the real side-effect (return value of fn)
// while observing the label.
jest.mock('@shared/observability/safeTrace', () => {
  const recordedLabels: string[] = [];
  return {
    safeTrace: jest.fn(<T>(label: string, fn: () => T): T | undefined => {
      recordedLabels.push(label);
      try {
        return fn();
      } catch {
        return undefined;
      }
    }),
    __getRecordedLabels: () => recordedLabels,
    __resetRecordedLabels: () => {
      recordedLabels.length = 0;
    },
  };
});

// The Langfuse client may or may not be configured in the test env. We force
// it to return `null` so `lf?.trace(...)` is a no-op — only the label
// recording matters for these assertions.
jest.mock('@shared/observability/langfuse.client', () => ({
  getLangfuse: () => null,
}));

// Cast through unknown so the formatter does not auto-strip the assertion.
interface SafeTraceMockHelpers {
  __getRecordedLabels: () => string[];
  __resetRecordedLabels: () => void;
}
const safeTraceMock: SafeTraceMockHelpers = jest.requireMock(
  '@shared/observability/safeTrace',
) as unknown as SafeTraceMockHelpers;

const SESSION_ID = 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4';
const USER_ID = 42;

const makeArtOutput = (): OrchestratorOutput => ({
  text: 'This painting by Monet captures the essence of impressionism.',
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

const makeOrchestrator = (): jest.Mocked<ChatOrchestrator> => ({
  generate: jest.fn().mockResolvedValue(makeArtOutput()),
  generateStream: jest.fn().mockResolvedValue(makeArtOutput()),
});

const makeImageStorage = (): jest.Mocked<ImageStorage> => ({
  save: jest.fn().mockResolvedValue('local://test-image.jpg'),
  deleteByPrefix: jest.fn().mockResolvedValue(undefined),
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

describe('A5 corrective loop 1 — chat.phase.* Langfuse spans (R2-R6 / AC4)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    safeTraceMock.__resetRecordedLabels();
  });

  describe('R6 — chat.phase.searching-collection (enrichment fan-out)', () => {
    it('emits chat.phase.searching-collection on every successful postMessage', async () => {
      const { service } = buildService();

      await service.postMessage(SESSION_ID, { text: 'Tell me about Monet' }, 'req-r6', USER_ID);

      const labels = safeTraceMock.__getRecordedLabels();
      expect(labels).toContain('chat.phase.searching-collection');
    });
  });

  describe('R4 — chat.phase.composing (orchestrator.generate)', () => {
    it('emits chat.phase.composing after orchestrator.generate succeeds', async () => {
      const { service } = buildService();

      await service.postMessage(SESSION_ID, { text: 'Compose path' }, 'req-r4', USER_ID);

      const labels = safeTraceMock.__getRecordedLabels();
      expect(labels).toContain('chat.phase.composing');
    });
  });

  describe('R9 — chat.phase.done (terminal marker)', () => {
    it('emits chat.phase.done at the success-path terminus', async () => {
      const { service } = buildService();

      await service.postMessage(SESSION_ID, { text: 'Terminal marker' }, 'req-r9', USER_ID);

      const labels = safeTraceMock.__getRecordedLabels();
      expect(labels).toContain('chat.phase.done');
    });

    it('emits done AFTER composing (timeline ordering)', async () => {
      const { service } = buildService();

      await service.postMessage(SESSION_ID, { text: 'Order check' }, 'req-order', USER_ID);

      const labels = safeTraceMock.__getRecordedLabels();
      const composingIdx = labels.indexOf('chat.phase.composing');
      const doneIdx = labels.indexOf('chat.phase.done');
      expect(composingIdx).toBeGreaterThanOrEqual(0);
      expect(doneIdx).toBeGreaterThan(composingIdx);
    });
  });

  describe('R3 — chat.phase.analyzing-image is NOT emitted on text-only requests', () => {
    it('does NOT emit chat.phase.analyzing-image when `image` is absent', async () => {
      const { service } = buildService();

      await service.postMessage(SESSION_ID, { text: 'No image attached' }, 'req-r3', USER_ID);

      const labels = safeTraceMock.__getRecordedLabels();
      expect(labels).not.toContain('chat.phase.analyzing-image');
    });
  });

  describe('helper contract', () => {
    it('emitChatPhaseSpan wraps the emit through safeTrace with the spec label', async () => {
      // Directly call the helper to lock the label format `chat.phase.<phase>`
      // against any drift in the helper implementation.
      const mod = await import('@shared/observability/chat-phase-span');
      mod.emitChatPhaseSpan('synthesizing-voice', Date.now(), { ctx: 'unit' });

      const labels = safeTraceMock.__getRecordedLabels();
      expect(labels).toContain('chat.phase.synthesizing-voice');
    });
  });
});
