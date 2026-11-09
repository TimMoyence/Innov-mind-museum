import {
  RerankerUnavailableError,
  type RerankResult,
  type RerankerPort,
} from '@modules/chat/domain/ports/reranker.port';

export interface BgeRerankerV2M3AdapterOptions {
  modelPath: string;
  timeoutMs: number;
}

export class BgeRerankerV2M3Adapter implements RerankerPort {
  private readonly modelPath: string;
  private readonly timeoutMs: number;

  public constructor(opts: BgeRerankerV2M3AdapterOptions) {
    this.modelPath = opts.modelPath;
    this.timeoutMs = opts.timeoutMs;
  }

  public rerank(_query: string, _docs: string[], _topN: number): Promise<RerankResult[]> {
    return Promise.reject(
      new RerankerUnavailableError(
        `bge-reranker-v2-m3 tokenizer not implemented (V2: C9.13.1) [modelPath=${this.modelPath}, timeoutMs=${this.timeoutMs}]`,
      ),
    );
  }
}
