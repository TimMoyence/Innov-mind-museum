/**
 * TD-LC-02 / TD-LC-03 contract tests for `toModel()` constructor options.
 *
 * Two acceptance gates fold here :
 *   - TD-LC-03 (acceptance batch1 #3) : the Deepseek branch MUST pass
 *     `streamUsage: false` to `new ChatOpenAI(...)`. Two distinct tests lock
 *     it (config-shape + provider-isolation) so a future refactor that drops
 *     the flag, or accidentally enables streaming on the OpenAI branch, both
 *     fail loudly.
 *   - TD-LC-02 (PATTERNS.md DO #6) : every LangChain chat-model constructor
 *     MUST receive explicit `maxRetries` + `timeout` — pinning the HTTP retry
 *     budget on top of the section-runner's own retry layer.
 *
 * `@langchain/openai` and `@langchain/google-genai` are mocked at module scope
 * so the constructor `options` argument is captured without touching network
 * or env. Each branch is exercised in its own `jest.isolateModules` block
 * with a dedicated `@src/config/env` mock so the branches in `toModel()` fire
 * deterministically.
 */

const chatOpenAICtorMock = jest.fn();
const chatGoogleCtorMock = jest.fn();

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation((...args: unknown[]) => {
    chatOpenAICtorMock(...args);
    return { provider: 'openai-mock' };
  }),
}));

jest.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: jest.fn().mockImplementation((...args: unknown[]) => {
    chatGoogleCtorMock(...args);
    return { provider: 'google-mock' };
  }),
}));

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@shared/observability/prometheus-metrics', () => ({
  llmPromptCacheHitsTotal: { inc: jest.fn() },
}));

interface MockedEnv {
  llm: {
    provider: 'openai' | 'deepseek' | 'google';
    model: string;
    temperature: number;
    maxOutputTokens: number;
    timeoutMs: number;
    openAiApiKey?: string;
    deepseekApiKey?: string;
    googleApiKey?: string;
  };
}

const buildEnv = (overrides: Partial<MockedEnv['llm']>): MockedEnv => ({
  llm: {
    provider: 'openai',
    model: 'gpt-4o-mini',
    temperature: 0.3,
    maxOutputTokens: 800,
    timeoutMs: 10_000,
    ...overrides,
  },
});

/** Loads `toModel` against a freshly-mocked env so each test isolates a branch. */
function loadToModelWithEnv(envOverrides: Partial<MockedEnv['llm']>): {
  toModel: () => unknown;
} {
  let mod: { toModel: () => unknown } | undefined;
  jest.isolateModules(() => {
    jest.doMock('@src/config/env', () => ({ env: buildEnv(envOverrides) }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- isolateModules pattern requires runtime require
    mod = require('@modules/chat/adapters/secondary/llm/langchain-orchestrator-support') as {
      toModel: () => unknown;
    };
  });
  if (!mod) throw new Error('failed to load support module under isolateModules');
  return mod;
}

beforeEach(() => {
  chatOpenAICtorMock.mockReset();
  chatGoogleCtorMock.mockReset();
});

describe('toModel() — Deepseek branch (TD-LC-03)', () => {
  it('passes streamUsage:false in the ChatOpenAI config', () => {
    const { toModel } = loadToModelWithEnv({
      provider: 'deepseek',
      deepseekApiKey: 'ds-key',
    });

    toModel();

    expect(chatOpenAICtorMock).toHaveBeenCalledTimes(1);
    const [config] = chatOpenAICtorMock.mock.calls[0] as [Record<string, unknown>];
    expect(config).toEqual(expect.objectContaining({ streamUsage: false }));
    // Sanity-anchor that we are indeed inspecting the Deepseek branch and not
    // the OpenAI fallback (which must NOT set streamUsage).
    expect(config).toEqual(
      expect.objectContaining({
        configuration: { baseURL: 'https://api.deepseek.com/v1' },
        apiKey: 'ds-key',
      }),
    );
  });

  it('streamUsage:false is scoped to Deepseek — the OpenAI branch leaves it unset', () => {
    const { toModel } = loadToModelWithEnv({
      provider: 'openai',
      openAiApiKey: 'oai-key',
    });

    toModel();

    expect(chatOpenAICtorMock).toHaveBeenCalledTimes(1);
    const [config] = chatOpenAICtorMock.mock.calls[0] as [Record<string, unknown>];
    expect(config).not.toHaveProperty('streamUsage');
    expect(config).not.toHaveProperty('configuration');
    expect(config).toEqual(expect.objectContaining({ apiKey: 'oai-key' }));
  });
});

describe('toModel() — maxRetries + timeout (TD-LC-02 / PATTERNS DO #6)', () => {
  it('OpenAI branch ships explicit maxRetries + timeout', () => {
    const { toModel } = loadToModelWithEnv({
      provider: 'openai',
      openAiApiKey: 'oai-key',
    });

    toModel();

    const [config] = chatOpenAICtorMock.mock.calls[0] as [Record<string, unknown>];
    expect(config).toEqual(
      expect.objectContaining({ maxRetries: expect.any(Number), timeout: 10_000 }),
    );
    expect(config.maxRetries).toBeGreaterThanOrEqual(1);
  });

  it('Deepseek branch ships explicit maxRetries + timeout', () => {
    const { toModel } = loadToModelWithEnv({
      provider: 'deepseek',
      deepseekApiKey: 'ds-key',
    });

    toModel();

    const [config] = chatOpenAICtorMock.mock.calls[0] as [Record<string, unknown>];
    expect(config).toEqual(
      expect.objectContaining({ maxRetries: expect.any(Number), timeout: 10_000 }),
    );
  });

  it('Google branch ships explicit maxRetries on ChatGoogleGenerativeAI', () => {
    const { toModel } = loadToModelWithEnv({
      provider: 'google',
      googleApiKey: 'g-key',
    });

    toModel();

    expect(chatGoogleCtorMock).toHaveBeenCalledTimes(1);
    const [config] = chatGoogleCtorMock.mock.calls[0] as [Record<string, unknown>];
    expect(config).toEqual(
      expect.objectContaining({
        apiKey: 'g-key',
        model: 'gpt-4o-mini',
        maxRetries: expect.any(Number),
      }),
    );
  });
});

describe('toModel() — returns null when no key is set', () => {
  it('returns null when provider=openai and no key is configured', () => {
    const { toModel } = loadToModelWithEnv({ provider: 'openai' });

    expect(toModel()).toBeNull();
    expect(chatOpenAICtorMock).not.toHaveBeenCalled();
    expect(chatGoogleCtorMock).not.toHaveBeenCalled();
  });
});
