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
//
// 2026-05-11 (C4 + C5.3 sentinel reconciliation): bumped 5 → 11 to admit
// six files that landed across two feature trains and exercise integration-
// tier contracts via stub injection at the infra seam:
//   - C4 T6.1 chat-citations.integration.test.ts (sources validator wiring)
//   - C4 T6.2 knowledge-router.integration.test.ts (router → orchestrator)
//   - C4 T7.1 knowledge-spans.test.ts (Langfuse chat.knowledge.lookup)
//   - C4 T7.2 head-probe-spans.test.ts (Langfuse chat.citations.head_probe)
//   - C4 T7.3 observability/prom-c4.test.ts (Prom counter registry surface)
//   - C5 Step 5.2 wikidata-resilience.integration.test.ts (real breaker +
//     cascade, fetch-mocked upstream)
// All six match the existing baseline shape (use-case orchestration / span
// emission / registry surface) with the real infra path covered by sibling
// tests carrying a real DataSource / testcontainer. Reduce back to a lower
// cap only by deleting entries, never by adding more.
//
// 2026-05-19 (C9.13 V1): bumped 11 → 12 to admit
// chat/rerank/multilingual-bench.test.ts — fixture-only nDCG@5 baseline
// scaffold (reads tests/fixtures/rerank-multilingual.json, computes
// scores, asserts ∈ [0,1]). No DB / HTTP / orchestrator in V1. Lives
// under integration/ because V2 (C9.13.1) swaps NullRerankerAdapter for
// the real reranker and asserts the +5pt uplift; at that point the file
// will satisfy the tier signature naturally and this exemption will be
// removed (cap returns to 11). Justification + approval ref in baseline JSON.
const PHASE_1_BASELINE_CAP = 12;

describe('integration tier-signature baseline cap', () => {
  it('baseline length never grows beyond the Phase 1 cap', () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as {
      exempt: { path: string }[];
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
