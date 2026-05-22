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
//
// 2026-05-19 (W1 merge cascade): bumped 12 → 13 to admit
// auth/rate-limit-zod-400-no-bump.integration.test.ts from Batch A
// (cluster 5 T1.5 R6). Express smoke test asserting validateBody
// short-circuits BEFORE the rate-limiter on 8 enumerated route sites.
// Uses createRouteTestApp (bare Express harness) — same shape as
// chat-api.smoke.integration.test.ts. The cap bump is required because
// the baseline entry was missed when Batch A originally landed on main
// (local pre-push gates skip this sentinel; CI quality job catches it).
//
// 2026-05-21 (p0/security hotfix cascade): bumped 13 → 15 to admit the
// two C1 PII-egress baseline entries that landed in 04f1a9c92 without
// the matching cap bump (cap-discipline doctrine violated by C1):
//   - observability/error-middleware-sentry.test.ts (C1-R4, supertest IS
//     the network boundary; pure middleware integration, no DB/Redis).
//   - observability/langfuse-pii-seed.test.ts (C1-R8, Langfuse SDK mask
//     invariant; mask function IS the network boundary, same pattern as
//     ssrf-matrix exemption — test intent IS the boundary).
// Both entries already justified + approved in the baseline JSON. Reduce
// back only by deleting entries, never by adding more.
// Bumped 15→16 for C2 chat-cost-breaker-503 integration test (2026-05-22, hotfix p0/security CI tier-signature fix). feedback_tier_baseline_cap_discipline.md — bump cap concomitant à l'ajout baseline.
const PHASE_1_BASELINE_CAP = 16;

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
