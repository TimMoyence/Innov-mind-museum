import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASELINE = JSON.parse(
  readFileSync(resolve(__dirname, '..', '..', 'e2e', 'a11y', '_disable-rules.json'), 'utf-8'),
) as { rules: { route: string; rule: string; reason: string; approved_by: string }[] };

// Phase 3 cap. Set to N + 0 buffer once the first run lands.
// Cap can shrink, never grow. Add new entries only via ADR amendment.
const PHASE_3_DISABLE_RULES_CAP = 0;

describe('a11y disable-rules cap', () => {
  it('disable-rules baseline length never grows beyond the Phase 3 cap', () => {
    expect(BASELINE.rules.length).toBeLessThanOrEqual(PHASE_3_DISABLE_RULES_CAP);
  });

  it('every disable rule has a reason and an approved_by', () => {
    for (const rule of BASELINE.rules) {
      expect(rule.reason.length).toBeGreaterThanOrEqual(20);
      expect(rule.approved_by.length).toBeGreaterThan(0);
    }
  });
});
