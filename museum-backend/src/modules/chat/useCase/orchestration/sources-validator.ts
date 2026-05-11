/**
 * Sources validator — Citations v2 (C4) string-match grounding gate.
 *
 * Architectural prevention vector (arXiv 2512.12117 — 100 % precision on the
 * 1080-response corpus via verbatim quote substring-match). The LLM may emit
 * `metadata.sources[]` (schema-validated at parse time by
 * `CitationSourceSchema.safeParse`) ; this use-case is the second line of
 * defense — it verifies that each emitted `quote` is actually a verbatim
 * substring of one of the fact blocks fed to the same LLM prompt.
 *
 * Strict substring match only — no fuzzy / Levenshtein (NG2). NFKC + lowercase
 * + whitespace-collapse normalization tolerates Unicode-equivalent accent
 * forms, mixed casing, and divergent whitespace without admitting fuzzy.
 *
 * Spec:   `team-state/2026-05-11-c4-anti-hallucination/spec.md#R4`
 * Design: `team-state/2026-05-11-c4-anti-hallucination/design.md#4`
 * Plan:   `docs/plans/2026-05-10-c4-launch-prompt.md` §F Step 2.4
 *
 * Hexagonal status: pure use-case (no I/O, no framework imports). Unit test
 * `tests/unit/chat/sources-validator.spec.ts` covers the 9 cases (match /
 * case / whitespace / NFKC / not-found / too-short / mixed / empty-sources /
 * empty-facts).
 */

import { logger } from '@shared/logger/logger';
import { chatSourcesRejectedTotal } from '@shared/observability/prometheus-metrics';

import type { CitationSource } from '@modules/chat/domain/chat.types';

/** Reason taxonomy for a rejected source — feeds `chat_sources_rejected_total{reason}`. */
export type SourceRejectionReason = 'quote-not-found' | 'quote-too-short';

/** Minimum NFKC-normalized quote length — mirrors the `CitationSourceSchema.quote.min(10)` clamp. */
const MIN_NORMALIZED_QUOTE_LENGTH = 10;

/**
 * Apply the agreed normalization pipeline (design D4):
 *   1. NFKC compatibility decomposition + canonical recomposition.
 *   2. Lowercase (locale-invariant).
 *   3. Collapse any run of whitespace (`\s+`) to a single ASCII space.
 *   4. Trim leading + trailing whitespace.
 *
 * Applied identically to the `quote` AND every `factBlock` before comparison
 * so that strings differing only in casing / whitespace / accent form match.
 */
function normalize(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** A single rejected source paired with its taxonomic reason. */
export interface RejectedSource {
  source: CitationSource;
  reason: SourceRejectionReason;
}

/** Partitioned outcome of {@link validateSources}. */
export interface SourceValidationResult {
  valid: CitationSource[];
  rejected: RejectedSource[];
}

/**
 * Partition `sources` into `{valid, rejected}` by verifying each `quote` is a
 * verbatim NFKC-normalized substring of at least one normalized fact block.
 *
 * - `quote` shorter than 10 chars (post-normalize) → `quote-too-short`.
 * - `quote` not present in any normalized fact → `quote-not-found`.
 * - Else → retained in `valid`.
 *
 * Pure function; no side-effects beyond a single aggregate `logger.warn` (counts
 * only — NEVER the quote content, per NFR7 PII safety + design §10 Logs).
 *
 * @param sources    Schema-valid (post-parse) citation candidates from the LLM.
 * @param factBlocks Fact strings injected into the LLM prompt — the grounding corpus.
 */
export function validateSources(
  sources: CitationSource[],
  factBlocks: string[],
): SourceValidationResult {
  const valid: CitationSource[] = [];
  const rejected: RejectedSource[] = [];

  // Single normalized corpus — facts joined with a sentinel space so that a
  // quote cannot accidentally span two unrelated facts via boundary collision.
  // The leading + trailing space prevent the same edge case at the corpus
  // endpoints. Choice of `\n` over ` ` would be equivalent post-collapse;
  // ` ` keeps the corpus inspectable in a debugger.
  const corpus = factBlocks.map(normalize).join(' ');

  for (const source of sources) {
    const normalizedQuote = normalize(source.quote);

    if (normalizedQuote.length < MIN_NORMALIZED_QUOTE_LENGTH) {
      rejected.push({ source, reason: 'quote-too-short' });
      // C4 T7.3 — surface in Prometheus. Cardinality bounded by
      // `SourceRejectionReason` taxonomy (2 values). Never throws (prom-client
      // counter mutation is sync and side-effect-only).
      chatSourcesRejectedTotal.inc({ reason: 'quote-too-short' });
      continue;
    }

    if (!corpus.includes(normalizedQuote)) {
      rejected.push({ source, reason: 'quote-not-found' });
      chatSourcesRejectedTotal.inc({ reason: 'quote-not-found' });
      continue;
    }

    valid.push(source);
  }

  if (rejected.length > 0) {
    // Counts only — NEVER the quote text (NFR7 PII safety + design §10 Logs).
    const reasons = rejected.map((r) => r.reason);
    logger.warn('[sources-validator] rejected sources', {
      rejectedCount: rejected.length,
      totalCount: sources.length,
      reasons,
    });
  }

  return { valid, rejected };
}
