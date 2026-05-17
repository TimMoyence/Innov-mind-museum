/**
 * Citations v2 (C4) string-match grounding gate (arXiv 2512.12117 — 100%
 * precision on 1080-response corpus via verbatim quote substring-match).
 * Strict substring only — NO fuzzy/Levenshtein (NG2). NFKC + lowercase +
 * whitespace-collapse tolerates Unicode-equivalent accents, mixed casing,
 * divergent whitespace without admitting fuzzy.
 */

import { logger } from '@shared/logger/logger';
import { chatSourcesRejectedTotal } from '@shared/observability/prometheus-metrics';

import type { CitationSource } from '@modules/chat/domain/chat.types';

export type SourceRejectionReason = 'quote-not-found' | 'quote-too-short';

/** Mirrors `CitationSourceSchema.quote.min(10)` clamp. */
const MIN_NORMALIZED_QUOTE_LENGTH = 10;

/**
 * D4 — NFKC + lowercase + collapse whitespace + trim. Applied identically to
 * `quote` AND every `factBlock` so strings differing only in casing /
 * whitespace / accent form match.
 */
function normalize(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface RejectedSource {
  source: CitationSource;
  reason: SourceRejectionReason;
}

export interface SourceValidationResult {
  valid: CitationSource[];
  rejected: RejectedSource[];
}

/**
 * Pure. NFR7 PII safety: log counts only, NEVER quote content.
 * Rejection: quote < 10 chars normalized → `quote-too-short`; not in corpus
 * → `quote-not-found`.
 */
export function validateSources(
  sources: CitationSource[],
  factBlocks: string[],
): SourceValidationResult {
  const valid: CitationSource[] = [];
  const rejected: RejectedSource[] = [];

  // Sentinel space between facts prevents quote spanning unrelated facts.
  const corpus = factBlocks.map(normalize).join(' ');

  for (const source of sources) {
    const normalizedQuote = normalize(source.quote);

    if (normalizedQuote.length < MIN_NORMALIZED_QUOTE_LENGTH) {
      rejected.push({ source, reason: 'quote-too-short' });
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
    // NFR7 — counts only, NEVER quote text.
    const reasons = rejected.map((r) => r.reason);
    logger.warn('[sources-validator] rejected sources', {
      rejectedCount: rejected.length,
      totalCount: sources.length,
      reasons,
    });
  }

  return { valid, rejected };
}
