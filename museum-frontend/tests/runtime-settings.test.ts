import test from 'node:test';
import assert from 'node:assert/strict';

import { defaults, normalizeGuideLevel } from '../features/settings/runtimeSettings.pure';

test('defaults have expected values', () => {
  assert.equal(defaults.defaultLocale, 'en-US');
  assert.equal(defaults.defaultMuseumMode, true);
  assert.equal(defaults.guideLevel, 'beginner');
});

test('normalizeGuideLevel accepts valid levels', () => {
  assert.equal(normalizeGuideLevel('beginner'), 'beginner');
  assert.equal(normalizeGuideLevel('intermediate'), 'intermediate');
  assert.equal(normalizeGuideLevel('expert'), 'expert');
});

test('normalizeGuideLevel falls back to default for invalid values', () => {
  assert.equal(normalizeGuideLevel(null), 'beginner');
  assert.equal(normalizeGuideLevel(''), 'beginner');
  assert.equal(normalizeGuideLevel('advanced'), 'beginner');
  assert.equal(normalizeGuideLevel('EXPERT'), 'beginner');
});
