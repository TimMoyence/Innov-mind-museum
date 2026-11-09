export interface RerankResult {
  docIndex: number;
  score: number;
}

export class RerankerUnavailableError extends Error {
  public readonly cause?: unknown;

  public constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'RerankerUnavailableError';
    this.cause = cause;
    Object.setPrototypeOf(this, RerankerUnavailableError.prototype);
  }
}

export interface RerankerPort {
  rerank(query: string, docs: string[], topN: number): Promise<RerankResult[]>;
}
