import { KnowledgeBaseService } from '@modules/chat/useCase/knowledge-base.service';
import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
  KnowledgeBaseQuery,
  KnowledgeBaseServiceConfig,
} from '@modules/chat/domain/ports/knowledge-base.port';

// Silence logger output during tests
jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ---------------------------------------------------------------------------
// Fake provider
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultConfig: KnowledgeBaseServiceConfig = {
  timeoutMs: 5_000,
  cacheTtlSeconds: 300,
  cacheMaxEntries: 100,
};

const makeService = (
  provider: FakeProvider = new FakeProvider(),
  config: KnowledgeBaseServiceConfig = defaultConfig,
) => ({ service: new KnowledgeBaseService(provider, config), provider });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('KnowledgeBaseService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  // 1. Returns prompt block for valid lookup
  it('returns a prompt block for a valid lookup', async () => {
    const { service } = makeService();

    const result = await service.lookup('Mona Lisa');

    expect(result).toContain('[KNOWLEDGE BASE');
    expect(result).toContain('Mona Lisa');
    expect(result).toContain('Leonardo da Vinci');
  });

  // 2. Returns '' when provider returns null
  it('returns empty string when provider returns null', async () => {
    const provider = new FakeProvider();
    provider.result = null;
    const { service } = makeService(provider);

    const result = await service.lookup('Unknown Artwork');

    expect(result).toBe('');
  });

  // 3. Returns '' on timeout (provider delays 600ms, config timeout 100ms)
  it('returns empty string on timeout', async () => {
    const provider = new FakeProvider();
    provider.delay = 600;
    const { service } = makeService(provider, { ...defaultConfig, timeoutMs: 100 });

    const result = await service.lookup('Slow Artwork');

    expect(result).toBe('');
  }, 10_000);

  // 4. Caches results (2 calls same term, provider called once)
  it('caches results — second call does not hit provider', async () => {
    const { service, provider } = makeService();

    await service.lookup('Mona Lisa');
    await service.lookup('Mona Lisa');

    expect(provider.callCount).toBe(1);
  });

  // 5. Cache key is normalized (case-insensitive)
  it('normalises cache key (case-insensitive, trimmed)', async () => {
    const { service, provider } = makeService();

    await service.lookup('  MONA LISA  ');
    await service.lookup('mona lisa');

    expect(provider.callCount).toBe(1);
  });

  // 6. Cache respects TTL (use jest.useFakeTimers to advance past TTL)
  it('cache respects TTL — expired entry triggers new fetch', async () => {
    jest.useFakeTimers();

    const provider = new FakeProvider();
    const config: KnowledgeBaseServiceConfig = {
      ...defaultConfig,
      cacheTtlSeconds: 60, // 60 seconds TTL
    };
    const { service } = makeService(provider, config);

    // First call — populates cache
    await service.lookup('Mona Lisa');
    expect(provider.callCount).toBe(1);

    // Advance past TTL
    jest.advanceTimersByTime(61_000);

    // Second call — cache expired, should hit provider again
    await service.lookup('Mona Lisa');
    expect(provider.callCount).toBe(2);
  });

  // 7. Cache evicts when max entries reached
  it('evicts oldest entry when cache is full', async () => {
    const provider = new FakeProvider();
    const config: KnowledgeBaseServiceConfig = {
      ...defaultConfig,
      cacheMaxEntries: 2,
    };
    const { service } = makeService(provider, config);

    await service.lookup('artwork-a');
    await service.lookup('artwork-b');
    await service.lookup('artwork-c'); // should evict 'artwork-a'

    expect(provider.callCount).toBe(3);

    // artwork-b should still be cached
    await service.lookup('artwork-b');
    expect(provider.callCount).toBe(3);

    // artwork-a was evicted — should trigger new fetch
    await service.lookup('artwork-a');
    expect(provider.callCount).toBe(4);
  });

  // 8. Does not throw on provider error
  it('does not throw on provider error — returns empty string', async () => {
    const provider = new FakeProvider();
    provider.shouldThrow = true;
    const { service } = makeService(provider);

    const result = await service.lookup('Broken Artwork');

    expect(result).toBe('');
  });

  // 9. Returns '' for empty search term
  it('returns empty string for empty search term', async () => {
    const { service, provider } = makeService();

    expect(await service.lookup('')).toBe('');
    expect(await service.lookup('   ')).toBe('');
    expect(provider.callCount).toBe(0);
  });
});
