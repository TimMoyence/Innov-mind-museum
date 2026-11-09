import { logger } from '@shared/logger/logger';

import type { CitationSource } from '@modules/chat/domain/chat.types';

export type SourceRejectionReason = 'quote-not-found' | 'quote-too-short';

const MIN_NORMALIZED_QUOTE_LENGTH = 10;

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

export function validateSources(
  sources: CitationSource[],
  factBlocks: string[],
): SourceValidationResult {
  const valid: CitationSource[] = [];
  const rejected: RejectedSource[] = [];

  const corpus = factBlocks.map(normalize).join(' ');

  for (const source of sources) {
    const normalizedQuote = normalize(source.quote);

    if (normalizedQuote.length < MIN_NORMALIZED_QUOTE_LENGTH) {
      rejected.push({ source, reason: 'quote-too-short' });
      continue;
    }

    if (!corpus.includes(normalizedQuote)) {
      rejected.push({ source, reason: 'quote-not-found' });
      continue;
    }

    valid.push(source);
  }

  if (rejected.length > 0) {
    const reasons = rejected.map((r) => r.reason);
    logger.warn('[sources-validator] rejected sources', {
      rejectedCount: rejected.length,
      totalCount: sources.length,
      reasons,
    });
  }

  return { valid, rejected };
}
