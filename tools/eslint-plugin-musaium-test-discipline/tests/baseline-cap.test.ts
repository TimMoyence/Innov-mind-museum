import * as fs from 'node:fs';
import * as path from 'node:path';

const BASELINE_PATH = path.join(__dirname, '..', 'baselines', 'no-inline-test-entities.json');

// Phase 7 (2026-05-01) — baseline emptied. Cap is now 0; any new inline
// `as Entity` outside helpers triggers an immediate gate fail.
const PHASE_0_CAP = 0;

describe('grandfather baseline cap', () => {
  it('baseline length never grows beyond the Phase 0 cap', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8')) as {
      baseline: string[];
    };
    expect(Array.isArray(baseline.baseline)).toBe(true);
    expect(baseline.baseline.length).toBeLessThanOrEqual(PHASE_0_CAP);
  });
});
