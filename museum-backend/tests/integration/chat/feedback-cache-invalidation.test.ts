import { ChatMediaService } from '@modules/chat/useCase/chat-media.service';
import { buildCacheKey } from '@modules/chat/useCase/chat-cache-key.util';
import type { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import type { ChatSession } from '@modules/chat/domain/chatSession.entity';
import type { ChatMessageWithSessionOwnership } from '@modules/chat/domain/chat.repository.interface';
import { makeSession, makeMessage, makeSessionUser } from '../../helpers/chat/message.fixtures';
import { makeChatRepo } from '../../helpers/chat/repo.fixtures';
import { makeCache } from '../../helpers/chat/cache.fixtures';

// Silence logger output during tests
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

const SESSION_ID = 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4';
const ASSISTANT_MSG_ID = 'b1b1b1b1-c2c2-4d3d-9e4e-f5f5f5f5f5f5';
const USER_MSG_ID = 'c2c2c2c2-d3d3-4e4e-af5f-060606060606';
const MUSEUM_ID = 7;
const USER_ID = 42;

const makeMessageRow = (
  msgOverrides: Partial<ChatMessage> = {},
  sessionOverrides: Partial<ChatSession> = {},
): ChatMessageWithSessionOwnership => {
  const session = makeSession({
    id: SESSION_ID,
    museumId: MUSEUM_ID,
    locale: 'fr',
    user: makeSessionUser(USER_ID),
    ...sessionOverrides,
  });
  const message = makeMessage({
    id: ASSISTANT_MSG_ID,
    role: 'assistant',
    text: "La Joconde est un chef-d'oeuvre",
    sessionId: SESSION_ID,
    ...msgOverrides,
    session,
  });
  return { message, session };
};

const makeHistory = (userText: string): ChatMessage[] => [
  makeMessage({ id: USER_MSG_ID, role: 'user', text: userText, sessionId: SESSION_ID }),
  makeMessage({
    id: ASSISTANT_MSG_ID,
    role: 'assistant',
    text: "La Joconde est un chef-d'oeuvre",
    sessionId: SESSION_ID,
  }),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feedback cache invalidation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('invalidates the LLM cache key when negative feedback is submitted', async () => {
    const userQuestion = 'Qui a peint la Joconde?';
    const row = makeMessageRow();
    const cache = makeCache();
    const repo = makeChatRepo({
      getMessageById: jest.fn().mockResolvedValue(row),
      upsertMessageFeedback: jest.fn().mockResolvedValue(undefined),
      getMessageFeedback: jest.fn().mockResolvedValue(null),
      listSessionHistory: jest.fn().mockResolvedValue(makeHistory(userQuestion)),
    });

    const expectedKey = buildCacheKey({
      text: userQuestion,
      museumId: String(MUSEUM_ID),
      locale: 'fr',
      guideLevel: 'beginner',
      audioDescriptionMode: false,
    });

    // Pre-populate cache so we can confirm deletion
    await cache.set(expectedKey, { text: 'cached response' });

    const svc = new ChatMediaService({ repository: repo, cache });
    const result = await svc.setMessageFeedback(ASSISTANT_MSG_ID, USER_ID, 'negative');

    expect(result).toEqual({ messageId: ASSISTANT_MSG_ID, status: 'created' });
    expect(cache.del).toHaveBeenCalledWith(expectedKey);
    expect(repo.listSessionHistory).toHaveBeenCalledWith(SESSION_ID, 50);
  });

  it('does NOT invalidate cache when positive feedback is submitted', async () => {
    const row = makeMessageRow();
    const cache = makeCache();
    const repo = makeChatRepo({
      getMessageById: jest.fn().mockResolvedValue(row),
      upsertMessageFeedback: jest.fn().mockResolvedValue(undefined),
      getMessageFeedback: jest.fn().mockResolvedValue(null),
      listSessionHistory: jest.fn().mockResolvedValue(makeHistory('Some question')),
    });

    const svc = new ChatMediaService({ repository: repo, cache });
    const result = await svc.setMessageFeedback(ASSISTANT_MSG_ID, USER_ID, 'positive');

    expect(result).toEqual({ messageId: ASSISTANT_MSG_ID, status: 'created' });
    expect(cache.del).not.toHaveBeenCalled();
    expect(repo.listSessionHistory).not.toHaveBeenCalled();
  });

  it('succeeds even when cache.del throws (fail-open)', async () => {
    const userQuestion = 'Tell me about this painting';
    const row = makeMessageRow();
    const cache = makeCache({
      del: jest.fn().mockRejectedValue(new Error('Redis connection lost')),
    });
    const repo = makeChatRepo({
      getMessageById: jest.fn().mockResolvedValue(row),
      upsertMessageFeedback: jest.fn().mockResolvedValue(undefined),
      getMessageFeedback: jest.fn().mockResolvedValue(null),
      listSessionHistory: jest.fn().mockResolvedValue(makeHistory(userQuestion)),
    });

    const svc = new ChatMediaService({ repository: repo, cache });
    const result = await svc.setMessageFeedback(ASSISTANT_MSG_ID, USER_ID, 'negative');

    // Feedback must succeed even though cache.del threw
    expect(result).toEqual({ messageId: ASSISTANT_MSG_ID, status: 'created' });
    expect(repo.upsertMessageFeedback).toHaveBeenCalledWith(ASSISTANT_MSG_ID, USER_ID, 'negative');
  });

  it('skips invalidation when session has no museumId', async () => {
    const row = makeMessageRow({}, { museumId: null });
    const cache = makeCache();
    const repo = makeChatRepo({
      getMessageById: jest.fn().mockResolvedValue(row),
      upsertMessageFeedback: jest.fn().mockResolvedValue(undefined),
      getMessageFeedback: jest.fn().mockResolvedValue(null),
      listSessionHistory: jest.fn().mockResolvedValue(makeHistory('Question')),
    });

    const svc = new ChatMediaService({ repository: repo, cache });
    await svc.setMessageFeedback(ASSISTANT_MSG_ID, USER_ID, 'negative');

    expect(cache.del).not.toHaveBeenCalled();
  });

  it('skips invalidation when no preceding user message exists', async () => {
    const row = makeMessageRow();
    const cache = makeCache();
    // History with only the assistant message (no preceding user message)
    const repo = makeChatRepo({
      getMessageById: jest.fn().mockResolvedValue(row),
      upsertMessageFeedback: jest.fn().mockResolvedValue(undefined),
      getMessageFeedback: jest.fn().mockResolvedValue(null),
      listSessionHistory: jest
        .fn()
        .mockResolvedValue([
          makeMessage({ id: ASSISTANT_MSG_ID, role: 'assistant', text: 'Response' }),
        ]),
    });

    const svc = new ChatMediaService({ repository: repo, cache });
    await svc.setMessageFeedback(ASSISTANT_MSG_ID, USER_ID, 'negative');

    expect(cache.del).not.toHaveBeenCalled();
  });

  it('uses session visitContext.detectedExpertise for cache key guideLevel', async () => {
    const userQuestion = 'Analyse stylistique du clair-obscur';
    const row = makeMessageRow(
      {},
      {
        visitContext: {
          museumName: 'Louvre',
          museumConfidence: 0.9,
          artworksDiscussed: [],
          roomsVisited: [],
          detectedExpertise: 'expert',
          expertiseSignals: 5,
          lastUpdated: new Date().toISOString(),
        },
      },
    );
    const cache = makeCache();
    const repo = makeChatRepo({
      getMessageById: jest.fn().mockResolvedValue(row),
      upsertMessageFeedback: jest.fn().mockResolvedValue(undefined),
      getMessageFeedback: jest.fn().mockResolvedValue(null),
      listSessionHistory: jest.fn().mockResolvedValue(makeHistory(userQuestion)),
    });

    const expectedKey = buildCacheKey({
      text: userQuestion,
      museumId: String(MUSEUM_ID),
      locale: 'fr',
      guideLevel: 'expert',
      audioDescriptionMode: false,
    });

    const svc = new ChatMediaService({ repository: repo, cache });
    await svc.setMessageFeedback(ASSISTANT_MSG_ID, USER_ID, 'negative');

    expect(cache.del).toHaveBeenCalledWith(expectedKey);
  });
});
