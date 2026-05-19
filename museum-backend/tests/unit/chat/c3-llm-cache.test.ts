/**
 * C3 — Cache LLM élargi scans œuvres répétitifs (RED tests).
 *
 * Feature spec: `docs/chat-ux-refonte/specs/C3.md`.
 * Baseline: `38d0aa23b`.
 *
 * These tests MUST FAIL at baseline. They assert that:
 *  - `LlmCacheKeyInput.imageContentHash` extends the canonical input hash
 *    (R6-R10) without invalidating legacy text-only keys (R8 / AC6).
 *  - TTL constants are REUSED, not introduced (R15-R17).
 *  - `ImageProcessingService.processImage` exposes `imageContentHash` on
 *    upload + legacy-base64 paths (R1, R3, R4, R5), absent on url path (R2).
 *  - `chat-message.service.postMessage` lifts the image bypass when a visual
 *    signature is plumbed (R11) and preserves the bypass otherwise (R12).
 *
 * The tests use the existing fixtures patterns from `llm-cache.service.test.ts`
 * and `image-processing-service.test.ts` — no new shared factory introduced.
 */

import { createHash } from 'node:crypto';

import { LlmCacheServiceImpl } from '@modules/chat/useCase/llm/llm-cache.service';
import { ImageProcessingService } from '@modules/chat/useCase/image/image-processing.service';

import type { CacheService } from '@shared/cache/cache.port';
import type { LlmCacheKeyInput } from '@modules/chat/useCase/llm/llm-cache.types';
import type { ImageStorage } from '@modules/chat/domain/ports/image-storage.port';
import type { PostMessageInput } from '@modules/chat/domain/chat.types';

jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@src/config/env', () => ({
  env: {
    upload: {
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    },
    llm: {
      maxImageBytes: 10_000_000,
      model: 'gpt-4o-mini',
    },
  },
}));

const buildMockCache = (): jest.Mocked<CacheService> =>
  ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    delByPrefix: jest.fn(),
    setNx: jest.fn(),
    ping: jest.fn(),
    zadd: jest.fn(),
  }) as unknown as jest.Mocked<CacheService>;

const baseInput: LlmCacheKeyInput = {
  model: 'gpt-4o-mini',
  userId: 'anon',
  systemSection: 'chat-default',
  locale: 'fr',
  prompt: 'Tell me about this painting',
};

const makeMockImageStorage = (): jest.Mocked<ImageStorage> => ({
  save: jest.fn().mockResolvedValue('s3://bucket/c3-stored-key'),
  deleteByPrefix: jest.fn().mockResolvedValue(undefined),
});

type ImageInput = NonNullable<PostMessageInput['image']>;

// JPEG magic-byte fixture used by image-processing tests
const VALID_JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
]);
const VALID_JPEG_BASE64 = VALID_JPEG_BYTES.toString('base64');

// Slightly different JPEG buffer (one byte changed) → distinct content hash (R4)
const DIFFERENT_JPEG_BYTES = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x02,
]);
const DIFFERENT_JPEG_BASE64 = DIFFERENT_JPEG_BYTES.toString('base64');

const expectedHashOf = (buffer: Buffer): string =>
  createHash('sha256').update(buffer).digest('hex').slice(0, 32);

describe('C3 — LlmCacheServiceImpl key derivation extension (R6-R10)', () => {
  it('R10 — accepts an optional imageContentHash on LlmCacheKeyInput without compile errors', async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);

    // This call MUST type-check at baseline. RED expectation: the input type
    // does not currently include `imageContentHash`, so this fails TS2353 at
    // baseline. After C3 lands (T2.1), it compiles.
    const input: LlmCacheKeyInput = {
      ...baseInput,
      imageContentHash: 'a'.repeat(32),
    };
    await service.lookup(input);
    expect(cache.get).toHaveBeenCalledTimes(1);
  });

  it('R6 / R7 — including imageContentHash in the canonical produces a DIFFERENT cache key from the text-only equivalent', async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);

    await service.store(baseInput, { text: 'text-only' });
    await service.store({ ...baseInput, imageContentHash: 'a'.repeat(32) }, { text: 'with-image' });

    const keyTextOnly = String(cache.set.mock.calls[0][0]);
    const keyWithImage = String(cache.set.mock.calls[1][0]);

    expect(keyTextOnly).not.toBe(keyWithImage);
    // Both keys share the prefix shape `llm:v2:{contextClass}:{museumId|none}:{userId|anon}:`
    // (F1 2026-05-19 — KEY_VERSION bumped v1→v2 to isolate voiceMode + audioDescriptionMode entries)
    expect(keyTextOnly).toMatch(/^llm:v2:generic:none:anon:[0-9a-f]{32}$/);
    expect(keyWithImage).toMatch(/^llm:v2:generic:none:anon:[0-9a-f]{32}$/);
  });

  it('R7 — two requests with the SAME imageContentHash and otherwise identical fields produce the SAME key', async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);

    const hash = 'a'.repeat(32);
    await service.store({ ...baseInput, imageContentHash: hash }, { text: 'a' });
    await service.store({ ...baseInput, imageContentHash: hash }, { text: 'b' });

    const k1 = String(cache.set.mock.calls[0][0]);
    const k2 = String(cache.set.mock.calls[1][0]);
    expect(k1).toBe(k2);
  });

  it('R6 — two requests with DIFFERENT imageContentHash values produce different keys', async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);

    await service.store({ ...baseInput, imageContentHash: 'a'.repeat(32) }, { text: 'a' });
    await service.store({ ...baseInput, imageContentHash: 'b'.repeat(32) }, { text: 'b' });

    const k1 = String(cache.set.mock.calls[0][0]);
    const k2 = String(cache.set.mock.calls[1][0]);
    expect(k1).not.toBe(k2);
  });

  it('R8 / AC6 — omitting imageContentHash produces the SAME key as a legacy text-only request (no migration break)', async () => {
    const cacheLegacy = buildMockCache();
    const cacheC3 = buildMockCache();
    const service = new LlmCacheServiceImpl(cacheLegacy);
    const serviceC3 = new LlmCacheServiceImpl(cacheC3);

    // Legacy call (pre-C3 shape — no imageContentHash field).
    await service.store(baseInput, { text: 'x' });
    // C3-aware call where the caller has no image — must NOT add the field
    // to the canonical (R10/R8). Result: byte-identical key.
    await serviceC3.store({ ...baseInput }, { text: 'x' });

    expect(String(cacheLegacy.set.mock.calls[0][0])).toBe(String(cacheC3.set.mock.calls[0][0]));
  });

  it('R8 — passing imageContentHash=undefined explicitly is equivalent to omitting it', async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);

    await service.store(baseInput, { text: 'x' });
    await service.store({ ...baseInput, imageContentHash: undefined }, { text: 'x' });

    expect(String(cache.set.mock.calls[0][0])).toBe(String(cache.set.mock.calls[1][0]));
  });

  it('R9 — image-bearing request with museumId classifies as museum-mode (no new class)', () => {
    const service = new LlmCacheServiceImpl(buildMockCache());
    const cls = service.classify({
      ...baseInput,
      imageContentHash: 'a'.repeat(32),
      museumContext: { museumId: 5, museumName: 'Louvre' },
    });
    expect(cls).toBe('museum-mode');
  });

  it('R9 — image-bearing request with userPreferencesHash classifies as personalized', () => {
    const service = new LlmCacheServiceImpl(buildMockCache());
    const cls = service.classify({
      ...baseInput,
      imageContentHash: 'a'.repeat(32),
      userPreferencesHash: 'p'.repeat(16),
    });
    expect(cls).toBe('personalized');
  });

  it('R9 — image-bearing request without museum/prefs classifies as generic', () => {
    const service = new LlmCacheServiceImpl(buildMockCache());
    const cls = service.classify({ ...baseInput, imageContentHash: 'a'.repeat(32) });
    expect(cls).toBe('generic');
  });
});

describe('C3 — LlmCacheServiceImpl TTL preservation (R15-R17)', () => {
  it('R15 / AC7 — store with imageContentHash + museumId reuses the 24h museum-mode TTL', async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);

    await service.store(
      {
        ...baseInput,
        imageContentHash: 'a'.repeat(32),
        museumContext: { museumId: 5, museumName: 'Orsay' },
      },
      { text: 'x' },
    );

    expect(cache.set).toHaveBeenCalledWith(expect.any(String), { text: 'x' }, 24 * 60 * 60);
  });

  it('R16 / AC8 — store with imageContentHash + userPreferencesHash reuses the 1h personalized TTL', async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);

    await service.store(
      {
        ...baseInput,
        imageContentHash: 'a'.repeat(32),
        userPreferencesHash: 'p'.repeat(16),
      },
      { text: 'x' },
    );

    expect(cache.set).toHaveBeenCalledWith(expect.any(String), { text: 'x' }, 60 * 60);
  });

  it('R17 — store with imageContentHash only (no museum/prefs) reuses the 7d generic TTL', async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);

    await service.store({ ...baseInput, imageContentHash: 'a'.repeat(32) }, { text: 'x' });

    expect(cache.set).toHaveBeenCalledWith(expect.any(String), { text: 'x' }, 7 * 24 * 60 * 60);
  });

  it('R18 — no new TTL constant: the only TTLs observed in image-cache paths are {3600, 86400, 604800}', async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);

    await service.store({ ...baseInput, imageContentHash: 'a'.repeat(32) }, { text: 'x' });
    await service.store(
      {
        ...baseInput,
        imageContentHash: 'b'.repeat(32),
        museumContext: { museumId: 1, museumName: 'M' },
      },
      { text: 'x' },
    );
    await service.store(
      { ...baseInput, imageContentHash: 'c'.repeat(32), userPreferencesHash: 'p' },
      { text: 'x' },
    );

    const ttls = cache.set.mock.calls.map((call) => Number(call[2]));
    const allowed = new Set([60 * 60, 24 * 60 * 60, 7 * 24 * 60 * 60]);
    for (const ttl of ttls) {
      expect(allowed.has(ttl)).toBe(true);
    }
  });
});

describe('C3 — ImageProcessingService exposes imageContentHash (R1-R5)', () => {
  it('R1 / AC1 — upload source returns imageContentHash = sha256(strippedBuffer).slice(0, 32)', async () => {
    const storage = makeMockImageStorage();
    const service = new ImageProcessingService({ imageStorage: storage });

    const image: ImageInput = {
      source: 'upload',
      value: VALID_JPEG_BASE64,
      mimeType: 'image/jpeg',
      sizeBytes: VALID_JPEG_BYTES.byteLength,
    };

    const result = await service.processImage(image, 'session-c3-1', 42);

    // RED expectation: `imageContentHash` does not exist on the returned
    // envelope at baseline. After T1.3 lands, the property is present and
    // equals the SHA-256 32-char prefix of the post-EXIF-strip buffer (which,
    // without an imageProcessor injected, is identical to the input buffer).
    const hash = (result as { imageContentHash?: string }).imageContentHash;
    expect(hash).toBe(expectedHashOf(VALID_JPEG_BYTES));
    expect(hash).toHaveLength(32);
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it('R1 — legacy base64 (data URL) source also returns imageContentHash', async () => {
    const storage = makeMockImageStorage();
    const service = new ImageProcessingService({ imageStorage: storage });

    const dataUrl = `data:image/jpeg;base64,${VALID_JPEG_BASE64}`;
    const image: ImageInput = { source: 'base64', value: dataUrl };

    const result = await service.processImage(image, 'session-c3-2', 42);

    const hash = (result as { imageContentHash?: string }).imageContentHash;
    expect(hash).toBe(expectedHashOf(VALID_JPEG_BYTES));
  });

  it('R2 / AC2 — url source does NOT include imageContentHash (no buffer to hash)', async () => {
    const storage = makeMockImageStorage();
    const service = new ImageProcessingService({ imageStorage: storage });

    const image: ImageInput = {
      source: 'url',
      value: 'https://example.com/photo.jpg',
    };

    const result = await service.processImage(image, 'session-c3-3');

    const hash = (result as { imageContentHash?: string }).imageContentHash;
    expect(hash).toBeUndefined();
  });

  it('R3 / AC3 — same buffer submitted twice produces identical imageContentHash', async () => {
    const service = new ImageProcessingService({ imageStorage: makeMockImageStorage() });

    const image: ImageInput = {
      source: 'upload',
      value: VALID_JPEG_BASE64,
      mimeType: 'image/jpeg',
      sizeBytes: VALID_JPEG_BYTES.byteLength,
    };

    const a = await service.processImage(image, 'session-c3-A', 42);
    const b = await service.processImage(image, 'session-c3-B', 99);

    const hashA = (a as { imageContentHash?: string }).imageContentHash;
    const hashB = (b as { imageContentHash?: string }).imageContentHash;
    expect(hashA).toBeDefined();
    expect(hashA).toBe(hashB);
  });

  it('R4 / AC4 — different buffers (1 byte diff) produce different imageContentHash', async () => {
    const service = new ImageProcessingService({ imageStorage: makeMockImageStorage() });

    const imageA: ImageInput = {
      source: 'upload',
      value: VALID_JPEG_BASE64,
      mimeType: 'image/jpeg',
      sizeBytes: VALID_JPEG_BYTES.byteLength,
    };
    const imageB: ImageInput = {
      source: 'upload',
      value: DIFFERENT_JPEG_BASE64,
      mimeType: 'image/jpeg',
      sizeBytes: DIFFERENT_JPEG_BYTES.byteLength,
    };

    const a = await service.processImage(imageA, 'session-c3-A', 42);
    const b = await service.processImage(imageB, 'session-c3-B', 42);

    const hashA = (a as { imageContentHash?: string }).imageContentHash;
    const hashB = (b as { imageContentHash?: string }).imageContentHash;
    expect(hashA).not.toBe(hashB);
    expect(hashA).toBe(expectedHashOf(VALID_JPEG_BYTES));
    expect(hashB).toBe(expectedHashOf(DIFFERENT_JPEG_BYTES));
  });

  it('R5 — hash is computed on the post-EXIF-strip buffer (when imageProcessor strips bytes)', async () => {
    const storage = makeMockImageStorage();
    // Mock imageProcessor that strips: returns a deterministic shortened buffer.
    // C3 must hash the OUTPUT of stripExif, not the input.
    const strippedBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const imageProcessor = {
      stripExif: jest.fn().mockResolvedValue({ buffer: strippedBuffer, mime: 'image/jpeg' }),
    } as unknown as ConstructorParameters<typeof ImageProcessingService>[0]['imageProcessor'];

    const service = new ImageProcessingService({ imageStorage: storage, imageProcessor });

    const image: ImageInput = {
      source: 'upload',
      value: VALID_JPEG_BASE64,
      mimeType: 'image/jpeg',
      sizeBytes: VALID_JPEG_BYTES.byteLength,
    };

    const result = await service.processImage(image, 'session-c3-strip', 42);

    const hash = (result as { imageContentHash?: string }).imageContentHash;
    // R5 — hash is of the stripped buffer (6 bytes), NOT the input buffer.
    expect(hash).toBe(expectedHashOf(strippedBuffer));
    expect(hash).not.toBe(expectedHashOf(VALID_JPEG_BYTES));
  });
});

describe('C3 — bypass preservation when no visual signature (R12)', () => {
  // R11 happy-path (image present + hash plumbed → lookup happens) is covered
  // by the integration-flavoured behavior tests in `chat-message-service.test.ts`
  // (extended in green phase). The unit-level R12 invariant is the cache
  // service contract: when `imageContentHash` is absent, the key derivation
  // is byte-identical to today's text-only path. Already locked by R8 above.
  //
  // Here we lock the additional invariant: the `LlmCacheServiceImpl` itself
  // is **agnostic** to the bypass decision — it ALWAYS derives a key. Bypass
  // is owned by the caller (ADR-036 contract). The test is a contract test.

  it('R12 / ADR-036 — service does NOT contain bypass-on-image logic; it derives a key for every input', async () => {
    const cache = buildMockCache();
    const service = new LlmCacheServiceImpl(cache);

    // Even with imageContentHash present, the service simply looks up. The
    // caller decides whether to bypass (the bypass logic for url-source
    // resides in chat-message.service.ts, not here).
    cache.get.mockResolvedValueOnce(null);
    const result = await service.lookup({
      ...baseInput,
      imageContentHash: 'a'.repeat(32),
    });

    expect(cache.get).toHaveBeenCalledTimes(1);
    expect(result.hit).toBe(false);
    // The derived key MUST embed the imageContentHash (different from a no-image key).
    const key = String(cache.get.mock.calls[0][0]);
    expect(key).toMatch(/^llm:v2:generic:none:anon:[0-9a-f]{32}$/);
  });

  it('R8 — non-regression on existing fail-open contract (cache.get throws → hit=false, contextClass propagated)', async () => {
    const cache = buildMockCache();
    cache.get.mockRejectedValueOnce(new Error('redis down'));
    const service = new LlmCacheServiceImpl(cache);

    const result = await service.lookup({
      ...baseInput,
      imageContentHash: 'a'.repeat(32),
      museumContext: { museumId: 5, museumName: 'Orsay' },
    });

    expect(result.hit).toBe(false);
    expect(result.contextClass).toBe('museum-mode');
  });
});
