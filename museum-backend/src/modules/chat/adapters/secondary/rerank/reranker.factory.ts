import { BgeRerankerV2M3Adapter } from '@modules/chat/adapters/secondary/rerank/bge-reranker-v2-m3.adapter';
import { NullRerankerAdapter } from '@modules/chat/adapters/secondary/rerank/null-reranker.adapter';

import type { RerankerPort } from '@modules/chat/domain/ports/reranker.port';
import type { AppEnv } from '@src/config/env.types';

export function createRerankerAdapter(env: AppEnv): RerankerPort {
  const rerank = env.rerank;

  switch (rerank.provider) {
    case 'null':
      return new NullRerankerAdapter();

    case 'bge-reranker-v2-m3':
      return new BgeRerankerV2M3Adapter({
        modelPath: rerank.modelPath,
        timeoutMs: rerank.timeoutMs,
      });

    default: {
      const exhaustive: never = rerank.provider;
      throw new Error(
        `createRerankerAdapter: unknown RERANK_PROVIDER value "${String(exhaustive)}"`,
      );
    }
  }
}
