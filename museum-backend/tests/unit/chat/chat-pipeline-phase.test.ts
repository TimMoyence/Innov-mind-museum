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
import type { ChatAssistantMetadata, ChatPipelinePhase } from '@modules/chat/domain/chat.types';

import { makeSession, makeMessage, makeSessionUser } from '../../helpers/chat/message.fixtures';
import { makeChatRepo } from '../../helpers/chat/repo.fixtures';
import { makeCache } from '../../helpers/chat/cache.fixtures';
import { makeArtOutput } from '../../helpers/chat/orchestratorOutput.fixtures';

const SESSION_ID = 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4';
const USER_ID = 42;

const EXPECTED_PHASES: readonly ChatPipelinePhase[] = [
  'analyzing-image',
  'searching-collection',
  'composing',
  'synthesizing-voice',
  'done',
];

const makeRepo = (
  session: ChatSession | null = makeSession({
    id: SESSION_ID,
    user: makeSessionUser(USER_ID),
  }),
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
  output: OrchestratorOutput = makeArtOutput(),
): jest.Mocked<ChatOrchestrator> => ({
  generate: jest.fn().mockResolvedValue(output),
});

const makeImageStorage = (): jest.Mocked<ImageStorage> => ({
  save: jest.fn().mockResolvedValue('local://test-image.jpg'),
  deleteByPrefix: jest.fn().mockResolvedValue(undefined),
});

const buildService = (
  overrides: Partial<ChatMessageServiceDeps> = {},
): {
  service: ChatMessageService;
  repo: jest.Mocked<ChatRepository>;
  orchestrator: jest.Mocked<ChatOrchestrator>;
} => {
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

  return { service, repo, orchestrator };
};

describe('A5 — Chat pipeline phase exposure', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('type contract (compile-time)', () => {
    it('ChatPipelinePhase contains exactly the 5 canonical phases', () => {
      const exhaustive: Record<ChatPipelinePhase, true> = {
        'analyzing-image': true,
        'searching-collection': true,
        composing: true,
        'synthesizing-voice': true,
        done: true,
      };
      expect(Object.keys(exhaustive).sort()).toEqual([...EXPECTED_PHASES].sort());
    });

    it('ChatAssistantMetadata.phase is optional ChatPipelinePhase (NFR8 backward-compat)', () => {
      const legacy: ChatAssistantMetadata = {};
      const fresh: ChatAssistantMetadata = { phase: 'done' };
      expect(legacy).toBeDefined();
      expect(fresh.phase).toBe('done');
    });
  });

  describe('postMessage (R1 — terminal phase = "done")', () => {
    it('returns metadata.phase === "done" on the success path', async () => {
      const { service } = buildService();

      const result = await service.postMessage(
        SESSION_ID,
        { text: 'Tell me about this painting' },
        'req-1',
        USER_ID,
      );

      expect(result.metadata.phase).toBe('done');
    });

    it('returns metadata.phase === "done" regardless of locale/context (success path uniformity)', async () => {
      const { service } = buildService();

      const result = await service.postMessage(
        SESSION_ID,
        { text: 'Bonjour, parle-moi de cette œuvre', context: { locale: 'fr' } },
        'req-2',
        USER_ID,
      );

      expect(result.metadata.phase).toBe('done');
    });
  });

  describe('phase taxonomy (R7 — exact 5 values, exact spelling)', () => {
    it('every value in EXPECTED_PHASES is a valid ChatPipelinePhase', () => {
      for (const phase of EXPECTED_PHASES) {
        const typed: ChatPipelinePhase = phase;
        expect(typeof typed).toBe('string');
      }
    });
  });
});
