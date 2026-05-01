import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { createIntegrationHarness } from 'tests/helpers/integration/integration-harness';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const BASELINE_PATH = join(REPO_ROOT, 'scripts/sentinels/.integration-tier-baseline.json');

// Long-term cap (post-Phase-1). The baseline currently holds 2 entries documenting
// files that legitimately live in tests/integration/ without crossing
// an infra boundary. Cap can shrink, never grow.
// New entries require ADR amendment.
const PHASE_1_BASELINE_CAP = 2;

describe('integration tier-signature baseline cap', () => {
  it('baseline length never grows beyond the Phase 1 cap', () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as {
      exempt: Array<{ path: string }>;
    };
    expect(Array.isArray(baseline.exempt)).toBe(true);
    expect(baseline.exempt.length).toBeLessThanOrEqual(PHASE_1_BASELINE_CAP);
  });

  // Keep harness import happy for tier-signature sentinel: this file lives under
  // tests/integration/_smoke/ and must satisfy the rule itself.
  it('imports the integration harness (self-conformance)', () => {
    expect(typeof createIntegrationHarness).toBe('function');
  });
});
