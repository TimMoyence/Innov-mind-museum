import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import { buildCacheKey, normalizeQuestion } from '@modules/chat/useCase/chat-cache-key.util';

interface TestVector {
  input: {
    text: string;
    museumId: string;
    locale: string;
    guideLevel: string;
    audioDescriptionMode: boolean;
  };
  normalizedText: string;
  components: string;
}

const vectors: TestVector[] = JSON.parse(
  readFileSync(join(__dirname, '../fixtures/cache-key-vectors.json'), 'utf-8'),
) as TestVector[];

describe('cache key parity', () => {
  it.each(vectors)('normalizes "$input.text" correctly', ({ input, normalizedText }) => {
    expect(normalizeQuestion(input.text)).toBe(normalizedText);
  });

  it.each(vectors)(
    'produces deterministic key for museumId=$input.museumId locale=$input.locale',
    ({ input, components }) => {
      const key = buildCacheKey({
        text: input.text,
        museumId: input.museumId,
        locale: input.locale,
        guideLevel: input.guideLevel as 'beginner' | 'intermediate' | 'expert',
        audioDescriptionMode: input.audioDescriptionMode,
      });
      const expectedHash = createHash('sha256').update(components).digest('hex').slice(0, 16);
      expect(key).toBe(`chat:llm:${input.museumId}:${expectedHash}`);
    },
  );

  it('produces different keys for different texts', () => {
    const key1 = buildCacheKey({
      text: 'question A',
      museumId: 'm',
      locale: 'fr',
      guideLevel: 'beginner',
      audioDescriptionMode: false,
    });
    const key2 = buildCacheKey({
      text: 'question B',
      museumId: 'm',
      locale: 'fr',
      guideLevel: 'beginner',
      audioDescriptionMode: false,
    });
    expect(key1).not.toBe(key2);
  });

  it('produces different keys for different museums', () => {
    const key1 = buildCacheKey({
      text: 'same',
      museumId: 'louvre',
      locale: 'fr',
      guideLevel: 'beginner',
      audioDescriptionMode: false,
    });
    const key2 = buildCacheKey({
      text: 'same',
      museumId: 'orsay',
      locale: 'fr',
      guideLevel: 'beginner',
      audioDescriptionMode: false,
    });
    expect(key1).not.toBe(key2);
  });
});
