import { CitationSourceSchema } from '@modules/chat/domain/chat.types';
import { logRerankFallback, runRerankWithSignal } from '@modules/chat/useCase/rerank/rerank-guard';
import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';

import type { CitationSource } from '@modules/chat/domain/chat.types';
import type { KnowledgeRouterSource } from '@modules/chat/domain/knowledge/knowledge-router.types';
import type { KnowledgeBaseProvider } from '@modules/chat/domain/ports/knowledge-base.port';
import type { RerankerPort } from '@modules/chat/domain/ports/reranker.port';
import type { SearchResult, WebSearchProvider } from '@modules/chat/domain/ports/web-search.port';
import type { LlmJudgePort } from '@modules/chat/useCase/llm/llm-judge-guardrail';
import type { LlmJudgeScope } from '@shared/observability/derive-tier';

export type { KnowledgeRouterSource };

export interface KnowledgeRouterResult {
  facts: string[];
  sources: CitationSource[];
  source: KnowledgeRouterSource;
  fallback_triggered: boolean;
  judge_confidence?: number;
  metadata?: {
    searchTerm: string;
    latencyMs: {
      kb?: number;
      judge?: number;
      web?: number;
    };
  };
}

export interface KnowledgeRouterPort {
  resolve(
    searchTerm: string,
    signal?: AbortSignal,
    scope?: LlmJudgeScope,
  ): Promise<KnowledgeRouterResult>;
}

export interface KnowledgeRouterConfig {
  threshold: number;
  kbTimeoutMs: number;
  judgeTimeoutMs: number;
  wsTimeoutMs: number;
  rerankTimeoutMs: number;
}

export interface KnowledgeRouterDeps {
  kb: KnowledgeBaseProvider;
  ws: WebSearchProvider;
  judge: LlmJudgePort;
  reranker: RerankerPort;
  config: KnowledgeRouterConfig;
}

const MAX_WEB_FACTS = 5;

const RERANK_CALLER_LABEL = 'knowledge-router';

function buildLegSignal(legBudgetMs: number, parentSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(legBudgetMs);
  return parentSignal ? AbortSignal.any([timeoutSignal, parentSignal]) : timeoutSignal;
}

function formatKbFacts(facts: {
  qid: string;
  title: string;
  artist?: string;
  date?: string;
  technique?: string;
  collection?: string;
  movement?: string;
  genre?: string;
}): string[] {
  const out: string[] = [`${facts.title} (Wikidata ${facts.qid}).`];
  if (facts.artist) out.push(`Artist: ${facts.artist}.`);
  if (facts.date) out.push(`Date: ${facts.date}.`);
  if (facts.technique) out.push(`Technique: ${facts.technique}.`);
  if (facts.collection) out.push(`Collection: ${facts.collection}.`);
  if (facts.movement) out.push(`Movement: ${facts.movement}.`);
  if (facts.genre) out.push(`Genre: ${facts.genre}.`);
  return out;
}

export class KnowledgeRouterService implements KnowledgeRouterPort {
  constructor(private readonly deps: KnowledgeRouterDeps) {}

  private async runWithLegBudget<T>(
    inner: Promise<T>,
    budgetMs: number,
    parentSignal?: AbortSignal,
  ): Promise<T> {
    const signal = buildLegSignal(budgetMs, parentSignal);

    if (signal.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error('AbortError');
    }

    return await new Promise<T>((resolve, reject) => {
      const onAbort = (): void => {
        reject(signal.reason instanceof Error ? signal.reason : new Error('AbortError'));
      };
      signal.addEventListener('abort', onAbort, { once: true });

      inner.then(
        (value) => {
          signal.removeEventListener('abort', onAbort);
          resolve(value);
        },
        (err: unknown) => {
          signal.removeEventListener('abort', onAbort);
          reject(err instanceof Error ? err : new Error(String(err)));
        },
      );
    });
  }

  async resolve(
    searchTerm: string,
    parentSignal?: AbortSignal,
    scope?: LlmJudgeScope,
  ): Promise<KnowledgeRouterResult> {
    return await this.resolveCore(searchTerm, parentSignal, scope);
  }

  private async resolveCore(
    searchTerm: string,
    parentSignal?: AbortSignal,
    scope?: LlmJudgeScope,
  ): Promise<KnowledgeRouterResult> {
    const latencyMs: { kb?: number; judge?: number; web?: number } = {};
    const searchTermNormalised = searchTerm;

    if (parentSignal?.aborted) {
      return {
        facts: [],
        sources: [],
        source: 'none',
        fallback_triggered: false,
        metadata: { searchTerm: searchTermNormalised, latencyMs },
      };
    }

    const kbStart = performance.now();
    const kbLeg = this.runWithLegBudget(
      this.deps.kb.lookup({ searchTerm: searchTermNormalised }),
      this.deps.config.kbTimeoutMs,
      parentSignal,
    );
    const kbFacts = await kbLeg.catch((err: unknown) => {
      logger.warn('knowledge_router_kb_error', {
        error: errorMessage(err),
      });
      return null;
    });
    latencyMs.kb = performance.now() - kbStart;

    if (kbFacts) {
      return {
        facts: formatKbFacts(kbFacts),
        sources: [],
        source: 'wikidata',
        fallback_triggered: false,
        metadata: { searchTerm: searchTermNormalised, latencyMs },
      };
    }

    const judgeStart = performance.now();
    const judgeSignal = buildLegSignal(this.deps.config.judgeTimeoutMs, parentSignal);
    const judge = await this.deps.judge
      .evaluate(searchTermNormalised, judgeSignal, scope)
      .catch((err: unknown) => {
        logger.warn('knowledge_router_judge_error', {
          error: errorMessage(err),
        });
        return { confidence: 0, decision: 'review' as const };
      });
    latencyMs.judge = performance.now() - judgeStart;

    if (judge.confidence >= this.deps.config.threshold) {
      return {
        facts: [],
        sources: [],
        source: 'none',
        fallback_triggered: false,
        judge_confidence: judge.confidence,
        metadata: { searchTerm: searchTermNormalised, latencyMs },
      };
    }

    const { webFacts, webSources, webResultCount, latencyWeb } = await this.runWebSearchLeg(
      searchTermNormalised,
      parentSignal,
    );
    latencyMs.web = latencyWeb;

    return {
      facts: webFacts,
      sources: webSources,
      source: webResultCount > 0 ? 'web' : 'none',
      fallback_triggered: true,
      judge_confidence: judge.confidence,
      metadata: { searchTerm: searchTermNormalised, latencyMs },
    };
  }

  private async runWebSearchLeg(
    searchTermNormalised: string,
    parentSignal: AbortSignal | undefined,
  ): Promise<{
    webFacts: string[];
    webSources: CitationSource[];
    webResultCount: number;
    latencyWeb: number;
  }> {
    const webStart = performance.now();
    const webSignal = buildLegSignal(this.deps.config.wsTimeoutMs, parentSignal);
    const webResults = await this.deps.ws
      .search({ query: searchTermNormalised, signal: webSignal })
      .catch((err: unknown) => {
        logger.warn('knowledge_router_ws_error', {
          error: errorMessage(err),
        });
        return [];
      });
    const latencyWeb = performance.now() - webStart;

    const orderedResults = await this.maybeRerankWebResults(searchTermNormalised, webResults);

    const usedResults = orderedResults.slice(0, MAX_WEB_FACTS);
    const webFacts = usedResults.map((r) => `${r.title}: ${r.snippet}`);
    const webSources = usedResults.flatMap((r) => {
      const source = CitationSourceSchema.safeParse({
        url: r.url,
        type: 'web',
        title: r.title.slice(0, 300),
        quote: r.snippet.slice(0, 500),
      });
      return source.success ? [source.data] : [];
    });

    return { webFacts, webSources, webResultCount: webResults.length, latencyWeb };
  }

  private async maybeRerankWebResults(
    searchTerm: string,
    webResults: readonly SearchResult[],
  ): Promise<readonly SearchResult[]> {
    if (webResults.length <= 1) return webResults;

    const candidateCount = webResults.length;
    const topN = Math.min(MAX_WEB_FACTS, candidateCount);
    const docs = webResults.map((r) => `${r.title}: ${r.snippet}`);

    try {
      const rerankResults = await runRerankWithSignal({
        reranker: this.deps.reranker,
        timeoutMs: this.deps.config.rerankTimeoutMs,
        query: searchTerm,
        docs,
        topN,
        signal: AbortSignal.timeout(this.deps.config.rerankTimeoutMs),
      });

      const reordered: SearchResult[] = [];
      const usedIndices = new Set<number>();
      for (const { docIndex } of rerankResults) {
        if (docIndex < 0 || docIndex >= webResults.length) continue;
        reordered.push(webResults[docIndex]);
        usedIndices.add(docIndex);
      }
      if (reordered.length < candidateCount) {
        for (let i = 0; i < webResults.length; i += 1) {
          if (!usedIndices.has(i)) {
            reordered.push(webResults[i]);
          }
        }
      }

      return reordered;
    } catch (err) {
      logRerankFallback(RERANK_CALLER_LABEL, searchTerm, candidateCount, err);
      return webResults;
    }
  }
}
