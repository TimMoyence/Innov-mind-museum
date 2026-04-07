import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  computeLocalCacheKey,
  normalizeQuestion,
} from '../features/chat/application/computeLocalCacheKey';

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

const vectorsPath = join(process.cwd(), '__tests__', 'fixtures', 'cache-key-vectors.json');
const vectors: TestVector[] = JSON.parse(readFileSync(vectorsPath, 'utf-8')) as TestVector[];

describe('cache key parity with backend', () => {
  for (const vector of vectors) {
    it(`normalizes "${vector.input.text}" correctly`, () => {
      assert.equal(normalizeQuestion(vector.input.text), vector.normalizedText);
    });
  }

  for (const vector of vectors) {
    it(`produces same key as backend for museumId=${vector.input.museumId} text="${vector.input.text}"`, () => {
      const key = computeLocalCacheKey({
        text: vector.input.text,
        museumId: vector.input.museumId,
        locale: vector.input.locale,
        guideLevel: vector.input.guideLevel,
        audioDescriptionMode: vector.input.audioDescriptionMode,
      });
      const expectedHash = createHash('sha256')
        .update(vector.components)
        .digest('hex')
        .slice(0, 16);
      assert.equal(key, `chat:llm:${vector.input.museumId}:${expectedHash}`);
    });
  }
});
