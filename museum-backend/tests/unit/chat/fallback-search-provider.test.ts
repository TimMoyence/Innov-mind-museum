import { FallbackSearchProvider } from '@modules/chat/adapters/secondary/search/fallback-search.provider';
import type { WebSearchProvider, WebSearchQuery } from '@modules/chat/domain/ports/web-search.port';

// Silence logger output during tests
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { logger } from '@shared/logger/logger';

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

function makeProvider(name: string, behavior: 'success' | 'empty' | 'throw'): WebSearchProvider {
  return {
    name,
    search: jest.fn().mockImplementation(async () => {
      if (behavior === 'throw') throw new Error(`${name} failed`);
      if (behavior === 'empty') return [];
      return [{ url: `https://${name}.com`, title: name, snippet: `From ${name}` }];
    }),
  };
}

const TEST_QUERY: WebSearchQuery = { query: 'impressionism paintings', maxResults: 5 };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FallbackSearchProvider', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('has name "fallback"', () => {
    const provider = new FallbackSearchProvider([]);
    expect(provider.name).toBe('fallback');
  });

  it('returns results from first successful provider and does not call second', async () => {
    const first = makeProvider('tavily', 'success');
    const second = makeProvider('google', 'success');
    const fallback = new FallbackSearchProvider([first, second]);

    const results = await fallback.search(TEST_QUERY);

    expect(results).toEqual([
      { url: 'https://tavily.com', title: 'tavily', snippet: 'From tavily' },
    ]);
    expect(first.search).toHaveBeenCalledTimes(1);
    expect(second.search).toHaveBeenCalledTimes(0);
  });

  it('falls back to second provider when first throws', async () => {
    const first = makeProvider('tavily', 'throw');
    const second = makeProvider('google', 'success');
    const fallback = new FallbackSearchProvider([first, second]);

    const results = await fallback.search(TEST_QUERY);

    expect(results).toEqual([
      { url: 'https://google.com', title: 'google', snippet: 'From google' },
    ]);
    expect(first.search).toHaveBeenCalledTimes(1);
    expect(second.search).toHaveBeenCalledTimes(1);
  });

  it('falls back to second provider when first returns empty results', async () => {
    const first = makeProvider('tavily', 'empty');
    const second = makeProvider('google', 'success');
    const fallback = new FallbackSearchProvider([first, second]);

    const results = await fallback.search(TEST_QUERY);

    expect(results).toEqual([
      { url: 'https://google.com', title: 'google', snippet: 'From google' },
    ]);
    expect(first.search).toHaveBeenCalledTimes(1);
    expect(second.search).toHaveBeenCalledTimes(1);
  });

  it('returns empty array when all providers fail', async () => {
    const providers = [
      makeProvider('tavily', 'throw'),
      makeProvider('google', 'empty'),
      makeProvider('brave', 'throw'),
    ];
    const fallback = new FallbackSearchProvider(providers);

    const results = await fallback.search(TEST_QUERY);

    expect(results).toEqual([]);
    for (const p of providers) {
      expect(p.search).toHaveBeenCalledTimes(1);
    }
  });

  it('returns empty array when constructed with no providers', async () => {
    const fallback = new FallbackSearchProvider([]);
    const results = await fallback.search(TEST_QUERY);
    expect(results).toEqual([]);
  });

  it('passes query through to providers unchanged', async () => {
    const provider = makeProvider('tavily', 'success');
    const fallback = new FallbackSearchProvider([provider]);
    const specificQuery: WebSearchQuery = { query: 'Van Gogh sunflowers', maxResults: 3 };

    await fallback.search(specificQuery);

    expect(provider.search).toHaveBeenCalledWith(specificQuery);
  });

  // ---------------------------------------------------------------------------
  // Logging
  // ---------------------------------------------------------------------------

  it('logs fallback_search_hit on success', async () => {
    const provider = makeProvider('tavily', 'success');
    const fallback = new FallbackSearchProvider([provider]);

    await fallback.search(TEST_QUERY);

    expect(logger.info).toHaveBeenCalledWith('fallback_search_hit', {
      provider: 'tavily',
      query: TEST_QUERY.query,
      resultCount: 1,
    });
  });

  it('logs fallback_search_empty when provider returns no results', async () => {
    const first = makeProvider('tavily', 'empty');
    const second = makeProvider('google', 'success');
    const fallback = new FallbackSearchProvider([first, second]);

    await fallback.search(TEST_QUERY);

    expect(logger.info).toHaveBeenCalledWith('fallback_search_empty', {
      provider: 'tavily',
      query: TEST_QUERY.query,
    });
  });

  it('logs fallback_search_provider_error when provider throws', async () => {
    const first = makeProvider('tavily', 'throw');
    const second = makeProvider('google', 'success');
    const fallback = new FallbackSearchProvider([first, second]);

    await fallback.search(TEST_QUERY);

    expect(logger.warn).toHaveBeenCalledWith('fallback_search_provider_error', {
      provider: 'tavily',
      error: 'tavily failed',
      query: TEST_QUERY.query,
    });
  });

  it('logs fallback_search_all_failed when all providers exhausted', async () => {
    const first = makeProvider('tavily', 'throw');
    const second = makeProvider('google', 'empty');
    const fallback = new FallbackSearchProvider([first, second]);

    await fallback.search(TEST_QUERY);

    expect(logger.warn).toHaveBeenCalledWith('fallback_search_all_failed', {
      query: TEST_QUERY.query,
    });
  });

  it('does not log fallback_search_all_failed when a provider succeeds', async () => {
    const provider = makeProvider('tavily', 'success');
    const fallback = new FallbackSearchProvider([provider]);

    await fallback.search(TEST_QUERY);

    expect(logger.warn).not.toHaveBeenCalledWith('fallback_search_all_failed', expect.anything());
  });

  it('uses "unknown" as provider name when name is undefined', async () => {
    const nameless: WebSearchProvider = {
      search: jest.fn().mockResolvedValue([]),
    };
    const fallback = new FallbackSearchProvider([nameless]);

    await fallback.search(TEST_QUERY);

    expect(logger.info).toHaveBeenCalledWith('fallback_search_empty', {
      provider: 'unknown',
      query: TEST_QUERY.query,
    });
  });

  it('stringifies non-Error throws in provider error log', async () => {
    const stringThrower: WebSearchProvider = {
      name: 'broken',
      search: jest.fn().mockRejectedValue('raw string error'),
    };
    const fallback = new FallbackSearchProvider([stringThrower]);

    await fallback.search(TEST_QUERY);

    expect(logger.warn).toHaveBeenCalledWith('fallback_search_provider_error', {
      provider: 'broken',
      error: 'raw string error',
      query: TEST_QUERY.query,
    });
  });
});
