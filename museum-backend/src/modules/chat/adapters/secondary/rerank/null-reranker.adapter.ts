import {
  RerankerUnavailableError,
  type RerankResult,
  type RerankerPort,
} from '@modules/chat/domain/ports/reranker.port';

export class NullRerankerAdapter implements RerankerPort {
  public rerank(_query: string, _docs: string[], _topN: number): Promise<RerankResult[]> {
    return Promise.reject(new RerankerUnavailableError('reranker disabled by configuration'));
  }
}
