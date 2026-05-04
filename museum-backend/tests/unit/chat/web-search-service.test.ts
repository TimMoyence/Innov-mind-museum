import { WebSearchService } from '@modules/chat/useCase/web-search/web-search.service';
import { makeMockCache } from '../../helpers/chat/cacheService.fixtures';
import type {
  SearchResult,
  WebSearchProvider,
  WebSearchQuery,
  WebSearchServiceConfig,
} from '@modules/chat/domain/ports/web-search.port';

// Silence logger output during tests
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

class FakeProvider implements WebSearchProvider {
  public callCount = 0;
  public delay = 0;
  public shouldThrow = false;
  public results: SearchResult[] = [
    {
      url: 'https://example.com/article',
      title: 'Sample Result',
      snippet: 'A sample snippet from the web.',
    },
  ];

  async search(_query: WebSearchQuery): Promise<SearchResult[]> {
    this.callCount++;
    if (this.shouldThrow) throw new Error('Network error');
    if (this.delay > 0) await new Promise((r) => setTimeout(r, this.delay));
    return this.results;
  }
}

const defaultConfig: WebSearchServiceConfig = {
  timeoutMs: 5_000,
  cacheTtlSeconds: 300,
  maxResults: 5,
};

const makeService = (
  provider: FakeProvider = new FakeProvider(),
  config: WebSearchServiceConfig = defaultConfig,
  cache = makeMockCache(),
) => ({ service: new WebSearchService(provider, config, cache), provider, cache });

describe('WebSearchService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns a prompt block for a valid search', async () => {
    const { service } = makeService();

    const result = await service.search('current exhibitions CAPC');

    expect(result).toContain('[WEB SEARCH');
    expect(result).toContain('Sample Result');
  });

  it('returns empty string when provider returns empty array', async () => {
    const provider = new FakeProvider();
    provider.results = [];
    const { service } = makeService(provider);

    const result = await service.search('nothing here');

    expect(result).toBe('');
  });

  it('returns empty string for empty query', async () => {
    const { service } = makeService();

    const result = await service.search('   ');

    expect(result).toBe('');
  });

  it('returns empty string on timeout', async () => {
    const provider = new FakeProvider();
    provider.delay = 600;
    const { service } = makeService(provider, { ...defaultConfig, timeoutMs: 100 });

    const result = await service.search('slow query');

    expect(result).toBe('');
  }, 10_000);

  it('returns empty string when provider throws (fail-open)', async () => {
    const provider = new FakeProvider();
    provider.shouldThrow = true;
    const { service } = makeService(provider);

    const result = await service.search('boom');

    expect(result).toBe('');
  });

  it('caches results — second call does not hit provider', async () => {
    const { service, provider } = makeService();

    await service.search('Mona Lisa');
    await service.search('Mona Lisa');

    expect(provider.callCount).toBe(1);
  });

  it('normalizes cache key (case + trim)', async () => {
    const { service, provider } = makeService();

    await service.search('Mona Lisa');
    await service.search('  MONA LISA  ');

    expect(provider.callCount).toBe(1);
  });

  it('searchRaw returns the raw results array', async () => {
    const { service } = makeService();

    const results = await service.searchRaw('test');

    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://example.com/article');
  });

  it('searchRaw returns empty array on provider error', async () => {
    const provider = new FakeProvider();
    provider.shouldThrow = true;
    const { service } = makeService(provider);

    const results = await service.searchRaw('boom');

    expect(results).toEqual([]);
  });
});
