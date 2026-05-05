import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { generateRequestId } from '../shared/infrastructure/requestId';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('generateRequestId', () => {
  it('returns a v4-format UUID string', () => {
    const id = generateRequestId();
    assert.match(id, UUID_V4_REGEX);
  });

  it('generates unique IDs across 100 calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateRequestId()));
    assert.equal(ids.size, 100);
  });

  it('sets version nibble to 4', () => {
    const id = generateRequestId();
    assert.equal(id[14], '4');
  });

  it('sets variant bits correctly (8, 9, a, or b)', () => {
    const id = generateRequestId();
    assert.ok(['8', '9', 'a', 'b'].includes(id[19] ?? ''));
  });
});
