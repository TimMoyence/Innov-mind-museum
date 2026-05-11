import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { createIntegrationHarness } from 'tests/helpers/integration/integration-harness';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const BASELINE_PATH = join(REPO_ROOT, 'scripts/sentinels/.integration-tier-baseline.json');

// Long-term cap (post-Phase-1). The baseline holds entries documenting
// files that legitimately live in tests/integration/ without crossing
// an infra boundary. Cap can shrink, never grow.
// New entries require ADR amendment.
//
// 2026-05-09 (C1 PR-G): bumped 2 → 4 to admit the two PR-A integration
// tests pinning chat-pipeline span emission (R1/R2) and admin↔chat
// invalidateMuseum contract (R9). Both have justifications + approval
// refs in the baseline JSON. Reduce back to 2 only by deleting one of
// those entries, never by adding more.
//
// 2026-05-10 (C3 T6.2): bumped 4 → 5 to admit compare.route.test.ts —
// bare Express smoke test mocking the use-case via spy (HTTP wire
// contract for POST /chat/compare). Same shape as the existing
// chat-api.smoke.integration.test.ts entry. Justification + approval
// ref in the baseline JSON.
const PHASE_1_BASELINE_CAP = 5;

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
