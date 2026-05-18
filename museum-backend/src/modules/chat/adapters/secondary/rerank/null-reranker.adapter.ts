/**
 * Production default `RerankerPort` implementation (C9.13). Always throws
 * {@link RerankerUnavailableError} with a "disabled by configuration" message,
 * letting both call sites (`KnowledgeRouterService`, `VisualSimilarityService`)
 * exercise their fail-open paths in V1 with zero behavior change.
 *
 * Selected by `createRerankerAdapter(env)` when `env.rerank.provider === 'null'`
 * (V1 production default).
 */

import {
  RerankerUnavailableError,
  type RerankResult,
  type RerankerPort,
} from '@modules/chat/domain/ports/reranker.port';

export class NullRerankerAdapter implements RerankerPort {
  /**
   * @throws {RerankerUnavailableError} always — this adapter signals the
   *         intentional "rerank disabled" state, not a bug.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- Justification: RerankerPort contract mandates Promise<RerankResult[]> return; the synchronous throw IS the contract this adapter exists to express (production default "rerank disabled" signal) — any await would mask the design intent. Approved-by: dispatcher 6c2da855 (C9.13 V1 production-default adapter — throws synchronously by design; Promise return enforced by port signature)
  public async rerank(_query: string, _docs: string[], _topN: number): Promise<RerankResult[]> {
    throw new RerankerUnavailableError('reranker disabled by configuration');
  }
}
