import { logRerankFallback, runRerankWithSignal } from '@modules/chat/useCase/rerank/rerank-guard';

import type { RerankerPort, RerankResult } from '@modules/chat/domain/ports/reranker.port';
import type { CompareMatch } from '@modules/chat/domain/visual-similarity/compare-result.types';

const CALLER_LABEL = 'visual-similarity';

export interface RerankPhaseDeps {
  reranker: RerankerPort;
  rerankTimeoutMs: number;
}

export async function maybeRerankCompareMatches(
  deps: RerankPhaseDeps,
  queryText: string,
  topMatches: CompareMatch[],
): Promise<CompareMatch[]> {
  const candidateCount = topMatches.length;
  const docs = topMatches.map((m) => m.facts.title);

  try {
    const rerankResults = await runRerankWithSignal({
      reranker: deps.reranker,
      timeoutMs: deps.rerankTimeoutMs,
      query: queryText,
      docs,
      topN: candidateCount,
      signal: AbortSignal.timeout(deps.rerankTimeoutMs),
    });
    return applyPermutation(topMatches, rerankResults);
  } catch (err) {
    logRerankFallback(CALLER_LABEL, queryText, candidateCount, err);
    return topMatches;
  }
}

function applyPermutation(
  topMatches: CompareMatch[],
  rerankResults: readonly RerankResult[],
): CompareMatch[] {
  const reordered: CompareMatch[] = [];
  const usedIndices = new Set<number>();
  for (const { docIndex } of rerankResults) {
    if (docIndex < 0 || docIndex >= topMatches.length) continue;
    reordered.push(topMatches[docIndex]);
    usedIndices.add(docIndex);
  }
  for (let i = 0; i < topMatches.length; i += 1) {
    if (!usedIndices.has(i)) {
      reordered.push(topMatches[i]);
    }
  }
  return reordered;
}
