import { ChatModule } from '@modules/chat/chat-module';
import { env } from '@src/config/env';
import type { WebSearchProvider } from '@modules/chat/domain/ports/web-search.port';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

type WebSearchEnv = Record<string, unknown>;

interface FallbackWithProviders {
  providers: WebSearchProvider[];
}

function builtProviderNames(): string[] {
  const module = new ChatModule();
  const buildWebSearch = (
    module as unknown as {
      buildWebSearch: () => { provider: WebSearchProvider };
    }
  ).buildWebSearch.bind(module);
  const { provider } = buildWebSearch();
  const providers = (provider as unknown as FallbackWithProviders).providers;
  return providers.map((p) => p.name ?? 'unknown');
}

const ws = env.webSearch as unknown as WebSearchEnv;

const SNAPSHOT: WebSearchEnv = { ...ws };

function resetWebSearchEnv(): void {
  for (const key of Object.keys(ws)) {
    delete ws[key];
  }
  Object.assign(ws, SNAPSHOT);
  ws.tavilyApiKey = undefined;
  ws.braveSearchApiKey = undefined;
  ws.googleCseApiKey = undefined;
  ws.googleCseId = undefined;
  ws.searxngInstances = undefined;
}

describe('buildWebSearch wiring (C9.15 reversal)', () => {
  beforeEach(() => {
    resetWebSearchEnv();
  });

  afterEach(() => {
    resetWebSearchEnv();
    jest.clearAllMocks();
  });

  it('pushes tavily, brave, google-cse, searxng, duckduckgo in order when all keys are set', () => {
    ws.tavilyApiKey = 'tav-key';
    ws.braveSearchApiKey = 'brave-key';
    ws.googleCseApiKey = 'gcse-key';
    ws.googleCseId = 'gcse-cx';
    ws.searxngInstances = ['https://sx-a.example'];

    expect(builtProviderNames()).toEqual([
      'tavily',
      'brave',
      'google-cse',
      'searxng',
      'duckduckgo',
    ]);
  });

  it('does not push google-cse when the CSE id is missing', () => {
    ws.googleCseApiKey = 'gcse-key';
    ws.googleCseId = undefined;

    expect(builtProviderNames()).not.toContain('google-cse');
  });

  it('does not push google-cse when the API key is missing', () => {
    ws.googleCseApiKey = undefined;
    ws.googleCseId = 'gcse-cx';

    expect(builtProviderNames()).not.toContain('google-cse');
  });

  it('does not push searxng when the instance list is empty/unset', () => {
    ws.searxngInstances = [];

    expect(builtProviderNames()).not.toContain('searxng');
  });

  it('pushes only duckduckgo when no other keys are configured', () => {
    expect(builtProviderNames()).toEqual(['duckduckgo']);
  });

  it('keeps the tavily/brave order and appends duckduckgo when only those keys are set', () => {
    ws.tavilyApiKey = 'tav-key';
    ws.braveSearchApiKey = 'brave-key';

    expect(builtProviderNames()).toEqual(['tavily', 'brave', 'duckduckgo']);
  });
});
