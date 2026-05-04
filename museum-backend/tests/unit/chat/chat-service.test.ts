import { ChatService } from '@modules/chat/useCase/orchestration/chat.service';
import { ChatSessionService } from '@modules/chat/useCase/session/chat-session.service';
import { ChatMessageService } from '@modules/chat/useCase/message/chat-message.service';
import { ChatMediaService } from '@modules/chat/useCase/audio/chat-media.service';
import type { ChatServiceDeps } from '@modules/chat/useCase/orchestration/chat.service';
import type { ChatOrchestrator } from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { ImageStorage } from '@modules/chat/domain/ports/image-storage.port';
import { makeChatRepo } from '../../helpers/chat/repo.fixtures';

jest.mock('@modules/chat/useCase/session/chat-session.service');
jest.mock('@modules/chat/useCase/message/chat-message.service');
jest.mock('@modules/chat/useCase/audio/chat-media.service');

const MockedSessionService = ChatSessionService as jest.MockedClass<typeof ChatSessionService>;
const MockedMessageService = ChatMessageService as jest.MockedClass<typeof ChatMessageService>;
const MockedMediaService = ChatMediaService as jest.MockedClass<typeof ChatMediaService>;

const makeOrchestrator = (): ChatOrchestrator => ({
  generate: jest.fn(),
  generateStream: jest.fn(),
});

const makeImageStorage = (): ImageStorage => ({
  save: jest.fn(),
  deleteByPrefix: jest.fn(),
});

const makeDeps = (overrides: Partial<ChatServiceDeps> = {}): ChatServiceDeps => ({
  repository: makeChatRepo(),
  orchestrator: makeOrchestrator(),
  imageStorage: makeImageStorage(),
  ...overrides,
});

describe('ChatService (facade)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('instantiates all three sub-services', () => {
    new ChatService(makeDeps());
    expect(MockedSessionService).toHaveBeenCalledTimes(1);
    expect(MockedMessageService).toHaveBeenCalledTimes(1);
    expect(MockedMediaService).toHaveBeenCalledTimes(1);
  });

  it('passes repository to all sub-services', () => {
    const repo = makeChatRepo();
    new ChatService(makeDeps({ repository: repo }));
    expect(MockedSessionService).toHaveBeenCalledWith(
      expect.objectContaining({ repository: repo }),
    );
    expect(MockedMessageService).toHaveBeenCalledWith(
      expect.objectContaining({ repository: repo }),
    );
    expect(MockedMediaService).toHaveBeenCalledWith(expect.objectContaining({ repository: repo }));
  });

  it('exposes all public facade methods', () => {
    const service = new ChatService(makeDeps());
    const methods = [
      'createSession',
      'getSession',
      'listSessions',
      'deleteSessionIfEmpty',
      'postMessage',
      'postMessageStream',
      'postAudioMessage',
      'getMessageImageRef',
      'reportMessage',
      'synthesizeSpeech',
      'setMessageFeedback',
    ];
    for (const method of methods) {
      expect(typeof (service as unknown as Record<string, unknown>)[method]).toBe('function');
    }
  });
});
