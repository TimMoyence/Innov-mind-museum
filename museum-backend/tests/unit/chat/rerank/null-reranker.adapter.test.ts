/**
 * RED — C9.13 — `NullRerankerAdapter` always throws `RerankerUnavailableError`.
 *
 * This is the V1 production default (env.rerank.provider='null'). Callers
 * must catch + fall back to baseline ordering.
 *
 * SUT does not yet exist.
 */

import { RerankerUnavailableError } from '@modules/chat/domain/ports/reranker.port';
import { NullRerankerAdapter } from '@modules/chat/adapters/secondary/rerank/null-reranker.adapter';

describe('NullRerankerAdapter (C9.13)', () => {
  it('throws RerankerUnavailableError on rerank()', async () => {
    const adapter = new NullRerankerAdapter();
    await expect(adapter.rerank('q', ['a', 'b'], 5)).rejects.toBeInstanceOf(
      RerankerUnavailableError,
    );
  });

  it('error message indicates intentional disabled state (not a bug)', async () => {
    const adapter = new NullRerankerAdapter();
    await expect(adapter.rerank('q', ['a'], 1)).rejects.toThrow(/disabled by configuration/i);
  });
});
