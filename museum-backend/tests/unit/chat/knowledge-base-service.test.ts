import { KnowledgeBaseService } from '@modules/chat/useCase/knowledge/knowledge-base.service';
import { makeMockCache } from '../../helpers/chat/cacheService.fixtures';
import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
  KnowledgeBaseQuery,
  KnowledgeBaseServiceConfig,
} from '@modules/chat/domain/ports/knowledge-base.port';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

class FakeProvider implements KnowledgeBaseProvider {
  public callCount = 0;
  public delay = 0;
  public shouldThrow = false;
  public result: ArtworkFacts | null = {
    qid: 'Q12418',
    title: 'Mona Lisa',
    artist: 'Leonardo da Vinci',
  };

  async lookup(_query: KnowledgeBaseQuery): Promise<ArtworkFacts | null> {
    this.callCount++;
    if (this.shouldThrow) throw new Error('Network error');
    if (this.delay > 0) await new Promise((r) => setTimeout(r, this.delay));
    return this.result;
  }
}

const defaultConfig: KnowledgeBaseServiceConfig = {
  timeoutMs: 5_000,
  cacheTtlSeconds: 300,
  cacheMaxEntries: 100,
};

const makeService = (
  provider: FakeProvider = new FakeProvider(),
  config: KnowledgeBaseServiceConfig = defaultConfig,
  cache = makeMockCache(),
) => ({ service: new KnowledgeBaseService(provider, config, cache), provider, cache });

describe('KnowledgeBaseService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns a prompt block for a valid lookup', async () => {
    const { service } = makeService();

    const result = await service.lookup('Mona Lisa');

    expect(result).toContain('[KNOWLEDGE BASE');
    expect(result).toContain('Mona Lisa');
    expect(result).toContain('Leonardo da Vinci');
  });

  it('returns empty string when provider returns null', async () => {
    const provider = new FakeProvider();
    provider.result = null;
    const { service } = makeService(provider);

    const result = await service.lookup('Unknown Artwork');

    expect(result).toBe('');
  });

  it('returns empty string on timeout', async () => {
    const provider = new FakeProvider();
    provider.delay = 600;
    const { service } = makeService(provider, { ...defaultConfig, timeoutMs: 100 });

    const result = await service.lookup('Slow Artwork');

    expect(result).toBe('');
  }, 10_000);

  it('caches results — second call does not hit provider', async () => {
    const { service, provider, cache } = makeService();

    await service.lookup('Mona Lisa');
    await service.lookup('Mona Lisa');

    expect(provider.callCount).toBe(1);
    expect(cache.store.has('kb:wikidata:mona lisa')).toBe(true);
  });

  it('normalises cache key (case-insensitive, trimmed)', async () => {
    const { service, provider } = makeService();

    await service.lookup('  MONA LISA  ');
    await service.lookup('mona lisa');

    expect(provider.callCount).toBe(1);
  });

  it('passes TTL to cache service on store', async () => {
    const cache = makeMockCache();
    const setSpy = jest.spyOn(cache, 'set');
    const config: KnowledgeBaseServiceConfig = {
      ...defaultConfig,
      cacheTtlSeconds: 60,
    };
    const { service } = makeService(new FakeProvider(), config, cache);

    await service.lookup('Mona Lisa');

    expect(setSpy).toHaveBeenCalledWith(
      'kb:wikidata:mona lisa',
      { facts: expect.objectContaining({ title: 'Mona Lisa' }) },
      60,
    );
  });

  it('does not throw on provider error — returns empty string', async () => {
    const provider = new FakeProvider();
    provider.shouldThrow = true;
    const { service } = makeService(provider);

    const result = await service.lookup('Broken Artwork');

    expect(result).toBe('');
  });

  it('returns empty string for empty search term', async () => {
    const { service, provider } = makeService();

    expect(await service.lookup('')).toBe('');
    expect(await service.lookup('   ')).toBe('');
    expect(provider.callCount).toBe(0);
  });

  it('works without cache service — always hits provider', async () => {
    const provider = new FakeProvider();
    const service = new KnowledgeBaseService(provider, defaultConfig);

    await service.lookup('Mona Lisa');
    await service.lookup('Mona Lisa');

    expect(provider.callCount).toBe(2);
  });

  it('falls through to provider when cache read fails', async () => {
    const cache = makeMockCache();
    cache.get = jest.fn().mockRejectedValue(new Error('Redis down'));
    const provider = new FakeProvider();
    const service = new KnowledgeBaseService(provider, defaultConfig, cache);

    const result = await service.lookup('Mona Lisa');

    expect(result).toContain('Mona Lisa');
    expect(provider.callCount).toBe(1);
  });

  it('returns result even when cache write fails', async () => {
    const cache = makeMockCache();
    cache.set = jest.fn().mockRejectedValue(new Error('Redis full'));
    const provider = new FakeProvider();
    const service = new KnowledgeBaseService(provider, defaultConfig, cache);

    const result = await service.lookup('Mona Lisa');

    expect(result).toContain('Mona Lisa');
    expect(provider.callCount).toBe(1);
  });

  it('lookupFacts returns cached facts on cache hit', async () => {
    const cache = makeMockCache();
    const expectedFacts: ArtworkFacts = {
      qid: 'Q12418',
      title: 'Mona Lisa',
      artist: 'Leonardo da Vinci',
    };
    await cache.set('kb:wikidata:mona lisa', { facts: expectedFacts });

    const provider = new FakeProvider();
    const service = new KnowledgeBaseService(provider, defaultConfig, cache);

    const result = await service.lookupFacts('Mona Lisa');

    expect(result).toEqual(expectedFacts);
    expect(provider.callCount).toBe(0);
  });
});
