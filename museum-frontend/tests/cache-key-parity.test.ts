import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  computeLocalCacheKey,
  normalizeQuestion,
  type LocalCacheKeyInput,
} from '../features/chat/application/computeLocalCacheKey';

interface TestVector {
  label: string;
  input: LocalCacheKeyInput;
  normalizedText: string;
  components: string;
  expectedKeyPrefix: string;
}

const vectorsPath = join(process.cwd(), '__tests__', 'fixtures', 'cache-key-vectors.json');
const vectors: TestVector[] = JSON.parse(readFileSync(vectorsPath, 'utf-8')) as TestVector[];

describe('cache key parity with backend', () => {
  for (const vector of vectors) {
    it(`normalizes "${vector.label}" correctly`, () => {
      assert.equal(normalizeQuestion(vector.input.text), vector.normalizedText);
    });
  }

  for (const vector of vectors) {
    it(`produces same key as backend for "${vector.label}"`, () => {
      const key = computeLocalCacheKey(vector.input);
      const expectedHash = createHash('sha256')
        .update(vector.components)
        .digest('hex')
        .slice(0, 16);
      assert.equal(key, `${vector.expectedKeyPrefix}${expectedHash}`);
    });
  }
});
