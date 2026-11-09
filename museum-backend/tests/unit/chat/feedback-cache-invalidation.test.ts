import { ChatMediaService } from '@modules/chat/useCase/audio/chat-media.service';
import { LlmCacheServiceImpl } from '@modules/chat/useCase/llm/llm-cache.service';
import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import type { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import type { ChatMessageWithSessionOwnership } from '@modules/chat/domain/session/chat.repository.interface';
import type { LlmCacheKeyInput } from '@modules/chat/useCase/llm/llm-cache.types';
import type { CacheService } from '@shared/cache/cache.port';
import { makeSession, makeMessage, makeSessionUser } from '../../helpers/chat/message.fixtures';
import { makeChatRepo } from '../../helpers/chat/repo.fixtures';

const loggerMock = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: (...args: unknown[]) => loggerMock.info(...args),
    warn: (...args: unknown[]) => loggerMock.warn(...args),
    error: (...args: unknown[]) => loggerMock.error(...args),
  },
}));

class MemoryCacheService implements CacheService {
  public readonly store = new Map<string, unknown>();
  public readonly delCalls: string[] = [];
  public delThrows: Error | null = null;

  async get<T>(key: string): Promise<T | null> {
    return (this.store.get(key) as T | undefined) ?? null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.delCalls.push(key);
    if (this.delThrows) {
      throw this.delThrows;
    }
    this.store.delete(key);
  }

  async delByPrefix(prefix: string): Promise<void> {
    for (const k of Array.from(this.store.keys())) {
      if (k.startsWith(prefix)) {
        this.store.delete(k);
      }
    }
  }

  async setNx(): Promise<boolean> {
    return true;
  }

  async incrBy(): Promise<number | null> {
    return null;
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async zadd(): Promise<void> {}

  async ztop(): Promise<{ member: string; score: number }[]> {
    return [];
  }
}

const SESSION_ID = 'a0a0a0a0-b1b1-4c2c-8d3d-e4e4e4e4e4e4';
const ASSISTANT_MSG_ID = 'b1b1b1b1-c2c2-4d3d-9e4e-f5f5f5f5f5f5';
const USER_MSG_ID = 'c2c2c2c2-d3d3-4e4e-af5f-060606060606';
const MUSEUM_ID = 7;
const USER_ID = 42;

type AssistantMessageWithCacheKey = ChatMessage & { cacheKey?: string | null };

const makeAssistantRow = (
  cacheKey: string | null,
  sessionOverrides: Partial<ChatSession> = {},
): ChatMessageWithSessionOwnership => {
  const session = makeSession({
    id: SESSION_ID,
    museumId: MUSEUM_ID,
    locale: 'fr',
    user: makeSessionUser(USER_ID),
    ...sessionOverrides,
  });
  const baseMessage = makeMessage({
    id: ASSISTANT_MSG_ID,
    role: 'assistant',
    text: "La Joconde est un chef-d'oeuvre",
    sessionId: SESSION_ID,
    session,
  });
  const message = Object.assign(baseMessage, { cacheKey }) as AssistantMessageWithCacheKey;
  return { message: message as ChatMessage, session };
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

const baselineInput = (variant: 'generic' | 'museum-mode' | 'personalized'): LlmCacheKeyInput => {
  const base: LlmCacheKeyInput = {
    model: 'gpt-4o-mini',
    userId: USER_ID,
    systemSection: 'chat-default',
    locale: 'fr',
    prompt: 'Qui a peint la Joconde ?',
  };
  if (variant === 'museum-mode') {
    return {
      ...base,
      museumContext: { museumId: MUSEUM_ID, museumName: 'Louvre' },
    };
  }
  if (variant === 'personalized') {
    return {
      ...base,
      museumContext: { museumId: MUSEUM_ID, museumName: 'Louvre' },
      userPreferencesHash: 'abc123userpref',
    };
  }
  return { ...base, userId: 'anon' };
};

async function storeAndCaptureKey(
  llmCache: LlmCacheServiceImpl,
  memCache: MemoryCacheService,
  input: LlmCacheKeyInput,
  value: unknown,
): Promise<string> {
  const before = new Set(memCache.store.keys());
  await llmCache.store(input, value);
  const afterKeys = Array.from(memCache.store.keys()).filter((k) => !before.has(k));
  if (afterKeys.length !== 1) {
    throw new Error(
      `storeAndCaptureKey expected exactly 1 new key, observed ${String(afterKeys.length)}: ${JSON.stringify(afterKeys)}`,
    );
  }
  return afterKeys[0];
}

describe('Feedback cache invalidation (non-tautological, UFR-022 PR-P0-1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loggerMock.info.mockClear();
    loggerMock.warn.mockClear();
    loggerMock.error.mockClear();
  });

  describe.each<['generic' | 'museum-mode' | 'personalized', string]>([
    ['generic', 'llm:v4:generic:'],
    ['museum-mode', 'llm:v4:museum-mode:'],
    ['personalized', 'llm:v4:personalized:'],
  ])(
    'purges the exact LlmCacheServiceImpl entry for contextClass=%s',
    (variant, expectedPrefix) => {
      it(`invalidates the real ${variant} key (captured from cache write path, not recomputed)`, async () => {
        const memCache = new MemoryCacheService();
        const llmCache = new LlmCacheServiceImpl(memCache);

        const realKey = await storeAndCaptureKey(llmCache, memCache, baselineInput(variant), {
          text: 'cached llm response',
        });

        expect(realKey.startsWith(expectedPrefix)).toBe(true);
        expect(memCache.store.has(realKey)).toBe(true);

        const row = makeAssistantRow(realKey);
        const repo = makeChatRepo({
          getMessageById: jest.fn().mockResolvedValue(row),
          upsertMessageFeedback: jest.fn().mockResolvedValue(undefined),
          getMessageFeedback: jest.fn().mockResolvedValue(null),
          listSessionHistory: jest.fn().mockResolvedValue(makeHistory('Qui a peint la Joconde ?')),
        });

        const svc = new ChatMediaService({ repository: repo, cache: memCache });
        const result = await svc.setMessageFeedback(ASSISTANT_MSG_ID, USER_ID, 'negative');

        expect(result).toEqual({ messageId: ASSISTANT_MSG_ID, status: 'created' });

        expect(memCache.store.has(realKey)).toBe(false);

        expect(memCache.delCalls).toContain(realKey);
      });
    },
  );

  it('does NOT call cache.del when positive feedback is submitted', async () => {
    const memCache = new MemoryCacheService();
    const llmCache = new LlmCacheServiceImpl(memCache);
    const realKey = await storeAndCaptureKey(llmCache, memCache, baselineInput('museum-mode'), {
      text: 'cached',
    });

    const row = makeAssistantRow(realKey);
    const repo = makeChatRepo({
      getMessageById: jest.fn().mockResolvedValue(row),
      upsertMessageFeedback: jest.fn().mockResolvedValue(undefined),
      getMessageFeedback: jest.fn().mockResolvedValue(null),
      listSessionHistory: jest.fn().mockResolvedValue(makeHistory('Qui a peint la Joconde ?')),
    });

    const svc = new ChatMediaService({ repository: repo, cache: memCache });
    const result = await svc.setMessageFeedback(ASSISTANT_MSG_ID, USER_ID, 'positive');

    expect(result).toEqual({ messageId: ASSISTANT_MSG_ID, status: 'created' });
    expect(memCache.delCalls).toEqual([]);
    expect(memCache.store.has(realKey)).toBe(true);
  });

  it('does NOT call cache.del when feedback toggle-off (same value re-submitted)', async () => {
    const memCache = new MemoryCacheService();
    const llmCache = new LlmCacheServiceImpl(memCache);
    const realKey = await storeAndCaptureKey(llmCache, memCache, baselineInput('museum-mode'), {
      text: 'cached',
    });

    const row = makeAssistantRow(realKey);
    const repo = makeChatRepo({
      getMessageById: jest.fn().mockResolvedValue(row),
      getMessageFeedback: jest.fn().mockResolvedValue({ value: 'negative' }),
      deleteMessageFeedback: jest.fn().mockResolvedValue(undefined),
    });

    const svc = new ChatMediaService({ repository: repo, cache: memCache });
    const result = await svc.setMessageFeedback(ASSISTANT_MSG_ID, USER_ID, 'negative');

    expect(result).toEqual({ messageId: ASSISTANT_MSG_ID, status: 'removed' });
    expect(memCache.delCalls).toEqual([]);
    expect(memCache.store.has(realKey)).toBe(true);
  });

  it('returns success (fail-open) and emits llm_cache_invalidate_failed WARN when cache.del throws', async () => {
    const memCache = new MemoryCacheService();
    const llmCache = new LlmCacheServiceImpl(memCache);
    const realKey = await storeAndCaptureKey(llmCache, memCache, baselineInput('museum-mode'), {
      text: 'cached',
    });

    memCache.delThrows = new Error('Redis connection lost');

    const row = makeAssistantRow(realKey);
    const repo = makeChatRepo({
      getMessageById: jest.fn().mockResolvedValue(row),
      upsertMessageFeedback: jest.fn().mockResolvedValue(undefined),
      getMessageFeedback: jest.fn().mockResolvedValue(null),
      listSessionHistory: jest.fn().mockResolvedValue(makeHistory('Q?')),
    });

    const svc = new ChatMediaService({ repository: repo, cache: memCache });
    const result = await svc.setMessageFeedback(ASSISTANT_MSG_ID, USER_ID, 'negative');

    expect(result).toEqual({ messageId: ASSISTANT_MSG_ID, status: 'created' });
    expect(repo.upsertMessageFeedback).toHaveBeenCalledWith(ASSISTANT_MSG_ID, USER_ID, 'negative');

    expect(memCache.delCalls).toContain(realKey);

    expect(loggerMock.warn).toHaveBeenCalledWith(
      'llm_cache_invalidate_failed',
      expect.objectContaining({
        messageId: ASSISTANT_MSG_ID,
        key: realKey,
        error: expect.stringContaining('Redis connection lost'),
      }),
    );
  });

  it('skips invalidation and emits llm_cache_invalidate_skipped INFO when message.cacheKey is null (legacy row)', async () => {
    const memCache = new MemoryCacheService();
    const llmCache = new LlmCacheServiceImpl(memCache);
    const unrelatedKey = await storeAndCaptureKey(
      llmCache,
      memCache,
      baselineInput('museum-mode'),
      { text: 'unrelated cached' },
    );

    const row = makeAssistantRow(null);
    const repo = makeChatRepo({
      getMessageById: jest.fn().mockResolvedValue(row),
      upsertMessageFeedback: jest.fn().mockResolvedValue(undefined),
      getMessageFeedback: jest.fn().mockResolvedValue(null),
      listSessionHistory: jest.fn().mockResolvedValue(makeHistory('Some Q?')),
    });

    const svc = new ChatMediaService({ repository: repo, cache: memCache });
    const result = await svc.setMessageFeedback(ASSISTANT_MSG_ID, USER_ID, 'negative');

    expect(result).toEqual({ messageId: ASSISTANT_MSG_ID, status: 'created' });

    expect(memCache.delCalls).toEqual([]);
    expect(memCache.store.has(unrelatedKey)).toBe(true);

    expect(loggerMock.info).toHaveBeenCalledWith(
      'llm_cache_invalidate_skipped',
      expect.objectContaining({
        messageId: ASSISTANT_MSG_ID,
        reason: 'no_cache_key',
      }),
    );
  });

  it('does not throw when ChatMediaService is constructed without a cache (early return)', async () => {
    const row = makeAssistantRow('llm:v4:museum-mode:7:42:abcdef');
    const repo = makeChatRepo({
      getMessageById: jest.fn().mockResolvedValue(row),
      upsertMessageFeedback: jest.fn().mockResolvedValue(undefined),
      getMessageFeedback: jest.fn().mockResolvedValue(null),
      listSessionHistory: jest.fn().mockResolvedValue(makeHistory('Q?')),
    });

    const svc = new ChatMediaService({ repository: repo });
    await expect(svc.setMessageFeedback(ASSISTANT_MSG_ID, USER_ID, 'negative')).resolves.toEqual({
      messageId: ASSISTANT_MSG_ID,
      status: 'created',
    });
  });
});
