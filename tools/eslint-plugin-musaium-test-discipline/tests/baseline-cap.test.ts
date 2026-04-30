import * as fs from 'node:fs';
import * as path from 'node:path';

const BASELINE_PATH = path.join(__dirname, '..', 'baselines', 'no-inline-test-entities.json');

describe('grandfather baseline cap', () => {
  it('baseline length never grows beyond Phase 0 initial count', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf-8')) as {
      baseline: string[];
      initialPhase0Count: number;
    };
    const initial = baseline.initialPhase0Count;
    expect(typeof initial).toBe('number');
    expect(baseline.baseline.length).toBeLessThanOrEqual(initial);
  });
});
