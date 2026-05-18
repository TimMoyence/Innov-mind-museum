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
  // eslint-disable-next-line @typescript-eslint/require-await -- contract requires Promise return; the throw shape is the entire purpose of this adapter
  public async rerank(_query: string, _docs: string[], _topN: number): Promise<RerankResult[]> {
    throw new RerankerUnavailableError('reranker disabled by configuration');
  }
}
