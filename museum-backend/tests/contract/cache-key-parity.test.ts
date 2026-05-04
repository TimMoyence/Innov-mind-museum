import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import {
  buildCacheKey,
  normalizeQuestion,
  type CacheKeyInput,
} from '@modules/chat/useCase/message/chat-cache-key.util';

interface TestVector {
  label: string;
  input: CacheKeyInput;
  normalizedText: string;
  components: string;
  expectedKeyPrefix: string;
}

const vectors: TestVector[] = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/cache-key-vectors.json'), 'utf-8'),
) as TestVector[];

describe('cache key parity', () => {
  it.each(vectors)('normalizes "$label" correctly', ({ input, normalizedText }) => {
    expect(normalizeQuestion(input.text)).toBe(normalizedText);
  });

  it.each(vectors)(
    'produces deterministic key for "$label"',
    ({ input, components, expectedKeyPrefix }) => {
      const key = buildCacheKey(input);
      const expectedHash = createHash('sha256').update(components).digest('hex').slice(0, 16);
      expect(key).toBe(`${expectedKeyPrefix}${expectedHash}`);
    },
  );

  it('produces different keys for different texts (same museum, generic)', () => {
    const base: Omit<CacheKeyInput, 'text'> = {
      museumId: 'm',
      locale: 'fr',
      guideLevel: 'beginner',
      audioDescriptionMode: false,
      hasHistory: false,
      hasAttachment: false,
      hasGeo: false,
    };
    expect(buildCacheKey({ ...base, text: 'question A' })).not.toBe(
      buildCacheKey({ ...base, text: 'question B' }),
    );
  });

  it('produces different keys for different museums (generic namespace)', () => {
    const base: Omit<CacheKeyInput, 'museumId'> = {
      text: 'same',
      locale: 'fr',
      guideLevel: 'beginner',
      audioDescriptionMode: false,
      hasHistory: false,
      hasAttachment: false,
      hasGeo: false,
    };
    expect(buildCacheKey({ ...base, museumId: 'louvre' })).not.toBe(
      buildCacheKey({ ...base, museumId: 'orsay' }),
    );
  });
});
