import * as fs from 'node:fs';
import * as path from 'node:path';

const BASELINE_PATH = path.join(__dirname, '..', 'baselines', 'no-inline-test-entities.json');

// P1-9 (2026-05-13) — baseline rebaselined from empty (`{baseline:[]}`) to
// the 15 BE files actually containing inline-entity violations today, after
// adding `eslint.config.test-discipline.mjs` + `pnpm lint:test-discipline`
// so the rule fires for the first time outside `src/`. Cap is the current
// floor; can only SHRINK. Earlier "Phase 7 cap = 0" was a lie because the
// rule never ran against tests/ — the empty baseline gave a false-green.
const PHASE_0_CAP = 15;

describe('grandfather baseline cap', () => {
  it('baseline length never grows beyond the Phase 0 cap', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8')) as {
      baseline: string[];
    };
    expect(Array.isArray(baseline.baseline)).toBe(true);
    expect(baseline.baseline.length).toBeLessThanOrEqual(PHASE_0_CAP);
  });
});
