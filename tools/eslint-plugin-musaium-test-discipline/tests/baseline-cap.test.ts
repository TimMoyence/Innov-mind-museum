import * as fs from 'node:fs';
import * as path from 'node:path';

const BASELINE_PATH = path.join(__dirname, '..', 'baselines', 'no-inline-test-entities.json');

// Phase 0 baseline cap — set 2026-04-30, do NOT raise this number.
// Phase 7 reduces it as files are migrated; nothing else can grow it.
const PHASE_0_CAP = 1;

describe('grandfather baseline cap', () => {
  it('baseline length never grows beyond the Phase 0 cap', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8')) as {
      baseline: string[];
    };
    expect(Array.isArray(baseline.baseline)).toBe(true);
    expect(baseline.baseline.length).toBeLessThanOrEqual(PHASE_0_CAP);
  });
});
