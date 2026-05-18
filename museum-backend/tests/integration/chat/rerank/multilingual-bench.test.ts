/**
 * RED → GREEN — C9.13 — Multilingual rerank benchmark scaffold.
 *
 * V1 scope (per design D4):
 *  - Load `tests/fixtures/rerank-multilingual.json` (queries grouped by locale).
 *  - For each locale, compute baseline nDCG@5 on the input candidate ordering
 *    against the ground-truth `expectedRankedQids` list.
 *  - Assert all baseline nDCG@5 values fall in [0, 1] (sanity).
 *  - Log a markdown summary table to stdout for human review.
 *
 * V2 (C9.13.1) will add the rerank-vs-baseline uplift assertion (+5pt nDCG@5
 * on ≥4/6 locales). The reranker is currently `NullRerankerAdapter` which
 * always throws → baseline-only path is what runs in V1.
 *
 * SUT depends on the fixture + nDCG@5 helper in the same file (no external
 * port needed for V1). RED until Phase 5 lands the fixture.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface BenchQuery {
  query: string;
  /** Input candidates as `title` strings; baseline order = array index. */
  candidates: { qid: string; title: string }[];
  /** Ground-truth top-K ordering. Top-5 used for nDCG@5. */
  expectedRankedQids: string[];
}

interface BenchFixture {
  _meta: {
    version: string;
    locales: string[];
    queriesPerLocale: number;
  };
  data: Record<string, BenchQuery[]>;
}

/**
 * Standard nDCG@K: DCG = sum_i (rel_i / log2(i+2)), normalized by IDCG.
 * Relevance is binary (1 if the candidate's qid is in expected, else 0)
 * weighted by inverse expected rank: rel_i = max(0, 1 - expectedRank/expectedLen)
 * — graded over the top-5 expected ground-truth list.
 */
function ndcgAt5(orderedQids: string[], expectedRankedQids: string[]): number {
  const expectedTop5 = expectedRankedQids.slice(0, 5);
  const top5 = orderedQids.slice(0, 5);

  const relOf = (qid: string): number => {
    const idx = expectedTop5.indexOf(qid);
    if (idx === -1) return 0;
    return (expectedTop5.length - idx) / expectedTop5.length;
  };

  let dcg = 0;
  for (let i = 0; i < top5.length; i += 1) {
    const qid = top5[i];
    if (qid === undefined) continue;
    dcg += relOf(qid) / Math.log2(i + 2);
  }

  let idcg = 0;
  const idealRels = expectedTop5.map((_, i) => (expectedTop5.length - i) / expectedTop5.length);
  for (let i = 0; i < idealRels.length; i += 1) {
    idcg += (idealRels[i] ?? 0) / Math.log2(i + 2);
  }

  return idcg === 0 ? 0 : dcg / idcg;
}

const FIXTURE_PATH = resolve(__dirname, '../../../fixtures/rerank-multilingual.json');

describe('Multilingual rerank benchmark — C9.13 V1 (baseline only)', () => {
  it('loads the fixture and computes baseline nDCG@5 per locale', () => {
    const raw = readFileSync(FIXTURE_PATH, 'utf-8');
    const fixture = JSON.parse(raw) as BenchFixture;

    expect(fixture._meta.locales.length).toBeGreaterThanOrEqual(6);

    const summary: { locale: string; queries: number; baselineNdcg5: number }[] = [];

    for (const locale of fixture._meta.locales) {
      const queries = fixture.data[locale] ?? [];
      expect(queries.length).toBeGreaterThan(0);

      let totalNdcg = 0;
      for (const q of queries) {
        const baselineOrdered = q.candidates.map((c) => c.qid);
        const score = ndcgAt5(baselineOrdered, q.expectedRankedQids);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
        totalNdcg += score;
      }
      const avg = totalNdcg / queries.length;
      summary.push({ locale, queries: queries.length, baselineNdcg5: avg });
    }

    // Human-readable markdown summary for CI logs.
    const lines: string[] = [];
    lines.push('\n=== C9.13 V1 baseline nDCG@5 per locale ===\n');
    lines.push('| Locale | Queries | Baseline nDCG@5 |');
    lines.push('|--------|---------|-----------------|');
    for (const row of summary) {
      lines.push(`| ${row.locale} | ${row.queries} | ${row.baselineNdcg5.toFixed(3)} |`);
    }
    lines.push('\n(V2 C9.13.1 adds rerank-vs-baseline uplift assertion.)\n');
    // Single write via process.stdout — avoids the no-console rule; the
    // markdown table is intentional CI-visible output for human review.
    process.stdout.write(lines.join('\n'));
  });
});
