import type {
  ChatOrchestrator,
  OrchestratorInput,
  OrchestratorOutput,
} from '@modules/chat/domain/ports/chat-orchestrator.port';
import type { PiiSanitizer } from '@modules/chat/domain/ports/pii-sanitizer.port';

jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { CachingChatOrchestrator } from '@modules/chat/adapters/secondary/llm/caching-chat-orchestrator';
import { makeMockCache } from '../../helpers/chat/cacheService.fixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeInput = (overrides: Partial<OrchestratorInput> = {}): OrchestratorInput => ({
  history: [],
  text: 'Tell me about the Mona Lisa',
  museumMode: true,
  museumId: 42,
  locale: 'en',
  context: { guideLevel: 'beginner' },
  requestId: 'req-123',
  ...overrides,
});

const makeOutput = (text = 'The Mona Lisa is a masterpiece.'): OrchestratorOutput => ({
  text,
  metadata: {},
});

const makeMockOrchestrator = (): jest.Mocked<ChatOrchestrator> => ({
  generate: jest.fn(),
  generateStream: jest.fn(),
});

const makeMockPiiSanitizer = (hasPii = false): PiiSanitizer => ({
  sanitize: jest.fn().mockReturnValue({
    sanitizedText: 'sanitized',
    detectedPiiCount: hasPii ? 1 : 0,
  }),
});

const buildOrchestrator = (
  overrides: {
    delegate?: jest.Mocked<ChatOrchestrator>;
    cache?: ReturnType<typeof makeMockCache>;
    ttlSeconds?: number;
    popularityZsetTtlSeconds?: number;
    piiSanitizer?: PiiSanitizer;
  } = {},
) => {
  const delegate = overrides.delegate ?? makeMockOrchestrator();
  const cache = overrides.cache ?? makeMockCache();
  const piiSanitizer = overrides.piiSanitizer ?? makeMockPiiSanitizer(false);

  const orchestrator = new CachingChatOrchestrator({
    delegate,
    cache,
    ttlSeconds: overrides.ttlSeconds ?? 3600,
    popularityZsetTtlSeconds: overrides.popularityZsetTtlSeconds ?? 86400,
    piiSanitizer,
  });

  return { orchestrator, delegate, cache, piiSanitizer };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CachingChatOrchestrator', () => {
  // -----------------------------------------------------------------------
  // shouldCache logic
  // -----------------------------------------------------------------------
  describe('shouldCache logic (via generate)', () => {
    it('skips cache when image is present', async () => {
      const { orchestrator, delegate } = buildOrchestrator();
      delegate.generate.mockResolvedValue(makeOutput());

      const input = makeInput({
        image: { source: 'base64', value: 'abc123' },
      });
      await orchestrator.generate(input);

      expect(delegate.generate).toHaveBeenCalledTimes(1);
    });

    it('skips cache when history is non-empty', async () => {
      const { orchestrator, delegate, cache } = buildOrchestrator();
      delegate.generate.mockResolvedValue(makeOutput());

      const input = makeInput({
        history: [{ id: 'msg-1', role: 'user', text: 'hi' } as never],
      });
      await orchestrator.generate(input);

      expect(delegate.generate).toHaveBeenCalledTimes(1);
      expect(cache.store.size).toBe(0);
    });

    it('skips cache when museumMode is false', async () => {
      const { orchestrator, delegate, cache } = buildOrchestrator();
      delegate.generate.mockResolvedValue(makeOutput());

      const input = makeInput({ museumMode: false });
      await orchestrator.generate(input);

      expect(delegate.generate).toHaveBeenCalledTimes(1);
      expect(cache.store.size).toBe(0);
    });

    it('skips cache when text exceeds 500 chars', async () => {
      const { orchestrator, delegate, cache } = buildOrchestrator();
      delegate.generate.mockResolvedValue(makeOutput());

      const input = makeInput({ text: 'a'.repeat(501) });
      await orchestrator.generate(input);

      expect(delegate.generate).toHaveBeenCalledTimes(1);
      expect(cache.store.size).toBe(0);
    });

    it('skips cache when userMemoryBlock is present', async () => {
      const { orchestrator, delegate, cache } = buildOrchestrator();
      delegate.generate.mockResolvedValue(makeOutput());

      const input = makeInput({ userMemoryBlock: 'some memory' });
      await orchestrator.generate(input);

      expect(delegate.generate).toHaveBeenCalledTimes(1);
      expect(cache.store.size).toBe(0);
    });

    it('skips cache when PII is detected', async () => {
      const piiSanitizer = makeMockPiiSanitizer(true);
      const { orchestrator, delegate, cache } = buildOrchestrator({ piiSanitizer });
      delegate.generate.mockResolvedValue(makeOutput());

      const input = makeInput();
      await orchestrator.generate(input);

      expect(delegate.generate).toHaveBeenCalledTimes(1);
      expect(cache.store.size).toBe(0);
    });

    it('skips cache when no museumId is extractable', async () => {
      const { orchestrator, delegate, cache } = buildOrchestrator();
      delegate.generate.mockResolvedValue(makeOutput());

      const input = makeInput({ museumId: null });
      await orchestrator.generate(input);

      expect(delegate.generate).toHaveBeenCalledTimes(1);
      expect(cache.store.size).toBe(0);
    });
  });

  // -----------------------------------------------------------------------
  // generate() — cache hit / miss
  // -----------------------------------------------------------------------
  describe('generate() cache hit/miss', () => {
    it('cache miss — delegates to real orchestrator and stores result', async () => {
      const { orchestrator, delegate, cache } = buildOrchestrator();
      const output = makeOutput('fresh response');
      delegate.generate.mockResolvedValue(output);

      const input = makeInput();
      const result = await orchestrator.generate(input);

      expect(result.text).toBe('fresh response');
      expect(delegate.generate).toHaveBeenCalledTimes(1);
      // Verify something was cached
      expect(cache.store.size).toBe(1);
    });

    it('cache hit — returns cached result without calling delegate', async () => {
      const { orchestrator, delegate } = buildOrchestrator();
      const output = makeOutput('cached response');
      delegate.generate.mockResolvedValue(output);

      const input = makeInput();

      // First call — cache miss, populates cache
      await orchestrator.generate(input);
      expect(delegate.generate).toHaveBeenCalledTimes(1);

      // Second call — cache hit
      const result = await orchestrator.generate(input);
      expect(result.text).toBe('cached response');
      expect(delegate.generate).toHaveBeenCalledTimes(1); // NOT called again
    });

    it('collision protection: treats as miss when cached originalText differs', async () => {
      const { orchestrator, delegate, cache } = buildOrchestrator();

      // First call with one text
      delegate.generate.mockResolvedValue(makeOutput('first response'));
      const input1 = makeInput({ text: 'Tell me about the Mona Lisa' });
      await orchestrator.generate(input1);
      expect(delegate.generate).toHaveBeenCalledTimes(1);

      // Manually tamper the cached entry to simulate a hash collision
      const cachedKey = [...cache.store.keys()][0];
      const cachedValue = cache.store.get(cachedKey) as Record<string, unknown>;
      cache.store.set(cachedKey, { ...cachedValue, originalText: 'different question entirely' });

      // Second call with original text — should treat as miss due to collision
      delegate.generate.mockResolvedValue(makeOutput('second response'));
      const result = await orchestrator.generate(input1);
      expect(result.text).toBe('second response');
      expect(delegate.generate).toHaveBeenCalledTimes(2);
    });
  });

  // -----------------------------------------------------------------------
  // bumpPopularity
  // -----------------------------------------------------------------------
  describe('bumpPopularity', () => {
    it('increments ZSET on both cache hit and miss', async () => {
      const { orchestrator, delegate, cache } = buildOrchestrator();
      delegate.generate.mockResolvedValue(makeOutput());

      const input = makeInput();

      // First call — miss
      await orchestrator.generate(input);
      // Second call — hit
      await orchestrator.generate(input);

      // Popularity ZSET should have been incremented twice
      const zsetKey = 'chat:llm:popular:42';
      const zset = cache.zsets.get(zsetKey);
      expect(zset).toBeDefined();
      const scores = [...zset!.values()];
      expect(scores[0]).toBe(2);
    });
  });

  // -----------------------------------------------------------------------
  // Fail-open
  // -----------------------------------------------------------------------
  describe('fail-open behavior', () => {
    it('returns delegate result when cache.get throws', async () => {
      const delegate = makeMockOrchestrator();
      const cache = makeMockCache();
      const output = makeOutput('delegate response');
      delegate.generate.mockResolvedValue(output);

      // Make cache.get throw
      jest.spyOn(cache, 'get').mockRejectedValue(new Error('Redis down'));

      const { orchestrator } = buildOrchestrator({ delegate, cache });
      const result = await orchestrator.generate(makeInput());

      expect(result.text).toBe('delegate response');
      expect(delegate.generate).toHaveBeenCalledTimes(1);
    });

    it('returns delegate result when cache.set throws', async () => {
      const delegate = makeMockOrchestrator();
      const cache = makeMockCache();
      const output = makeOutput('delegate response');
      delegate.generate.mockResolvedValue(output);

      // Make cache.set throw
      jest.spyOn(cache, 'set').mockRejectedValue(new Error('Redis full'));

      const { orchestrator } = buildOrchestrator({ delegate, cache });
      const result = await orchestrator.generate(makeInput());

      expect(result.text).toBe('delegate response');
      expect(delegate.generate).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // generateStream
  // -----------------------------------------------------------------------
  describe('generateStream', () => {
    it('replays cached chunks on cache hit', async () => {
      const { orchestrator, delegate } = buildOrchestrator();
      const output = makeOutput('Hello world, this is cached text.');
      delegate.generateStream.mockImplementation(async (_input, onChunk) => {
        for (const char of output.text) onChunk(char);
        return output;
      });

      const input = makeInput();

      // First call — miss, populates cache
      const chunks1: string[] = [];
      await orchestrator.generateStream(input, (c: string) => chunks1.push(c));
      expect(delegate.generateStream).toHaveBeenCalledTimes(1);

      // Second call — hit, replayed from cache
      const chunks2: string[] = [];
      const result = await orchestrator.generateStream(input, (c: string) => chunks2.push(c));

      expect(delegate.generateStream).toHaveBeenCalledTimes(1); // NOT called again
      expect(result.text).toBe('Hello world, this is cached text.');
      // Chunks should be emitted (8-char segments)
      expect(chunks2.length).toBeGreaterThan(0);
      expect(chunks2.join('')).toBe('Hello world, this is cached text.');
    });

    it('delegates and caches on cache miss', async () => {
      const { orchestrator, delegate, cache } = buildOrchestrator();
      const output = makeOutput('streamed result');
      delegate.generateStream.mockImplementation(async (_input, onChunk) => {
        for (const word of output.text.split(' ')) onChunk(word + ' ');
        return output;
      });

      const input = makeInput();
      const chunks: string[] = [];
      const result = await orchestrator.generateStream(input, (c: string) => chunks.push(c));

      expect(result.text).toBe('streamed result');
      expect(delegate.generateStream).toHaveBeenCalledTimes(1);
      expect(chunks.join('')).toBe('streamed result ');
      // Verify it was cached
      expect(cache.store.size).toBe(1);
    });
  });
});
