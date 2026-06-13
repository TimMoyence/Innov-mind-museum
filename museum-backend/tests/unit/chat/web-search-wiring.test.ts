/**
 * Wiring contract for `ChatModule.buildWebSearch` after the C9.15 reversal.
 *
 * Asserts the fallback chain order is additive on env-key presence:
 *   Tavily -> Brave -> Google CSE -> SearXNG -> DuckDuckGo
 * (each present iff its env predicate holds; DuckDuckGo always; no feature flag).
 *
 * Tier = unit. `global.fetch` is never hit — we only inspect the constructed
 * provider list. The real `env.webSearch` object is mutated per-case and
 * restored in afterEach.
 */
import { ChatModule } from '@modules/chat/chat-module';
import { env } from '@src/config/env';
import type { WebSearchProvider } from '@modules/chat/domain/ports/web-search.port';

// Silence logger
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

/** Mutable view of the webSearch env block (fields added by the green phase). */
type WebSearchEnv = Record<string, unknown>;

interface FallbackWithProviders {
  providers: WebSearchProvider[];
}

/** Calls the private buildWebSearch and reads the constructed provider names in order. */
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
  // Clear the four credential-bearing keys so each test starts from a known base.
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

  // UC-WIRE-01 — full chain in deterministic order
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

  // UC-WIRE-02 — google needs BOTH key and cx (cx missing -> not pushed)
  it('does not push google-cse when the CSE id is missing', () => {
    ws.googleCseApiKey = 'gcse-key';
    ws.googleCseId = undefined;

    expect(builtProviderNames()).not.toContain('google-cse');
  });

  // UC-WIRE-03 — google needs BOTH key and cx (key missing -> not pushed)
  it('does not push google-cse when the API key is missing', () => {
    ws.googleCseApiKey = undefined;
    ws.googleCseId = 'gcse-cx';

    expect(builtProviderNames()).not.toContain('google-cse');
  });

  // UC-WIRE-04 — searxng needs a non-empty instance list
  it('does not push searxng when the instance list is empty/unset', () => {
    ws.searxngInstances = [];

    expect(builtProviderNames()).not.toContain('searxng');
  });

  // UC-WIRE-05 — no keys at all -> duckduckgo only (free always-on tail)
  it('pushes only duckduckgo when no other keys are configured', () => {
    expect(builtProviderNames()).toEqual(['duckduckgo']);
  });

  // UC-WIRE-06 — regression: existing tavily+brave behaviour preserved + ddg tail
  it('keeps the tavily/brave order and appends duckduckgo when only those keys are set', () => {
    ws.tavilyApiKey = 'tav-key';
    ws.braveSearchApiKey = 'brave-key';

    expect(builtProviderNames()).toEqual(['tavily', 'brave', 'duckduckgo']);
  });
});
