/**
 * `RerankerPort` factory (C9.13, design §3 D2). Branches on
 * `env.rerank.provider`:
 *  - `'null'` (V1 production default) → {@link NullRerankerAdapter} (always
 *    throws "disabled by configuration"; callers fall back to baseline order).
 *  - `'bge-reranker-v2-m3'` → {@link BgeRerankerV2M3Adapter} (V1 scaffold;
 *    `rerank()` throws "tokenizer not implemented (V2: C9.13.1)"; V2 swap
 *    is a single adapter change).
 *
 * Exhaustiveness guard via `never`-narrow — adding a new provider without
 * a case fails compile.
 *
 * Pure — composition roots call once at boot.
 */

import { BgeRerankerV2M3Adapter } from '@modules/chat/adapters/secondary/rerank/bge-reranker-v2-m3.adapter';
import { NullRerankerAdapter } from '@modules/chat/adapters/secondary/rerank/null-reranker.adapter';

import type { RerankerPort } from '@modules/chat/domain/ports/reranker.port';
import type { AppEnv } from '@src/config/env.types';

/** @throws {Error} on unknown provider (exhaustiveness guard). */
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
