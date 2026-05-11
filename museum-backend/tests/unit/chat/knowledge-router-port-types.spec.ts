/**
 * T3.1 — KnowledgeRouterPort compile-only type contract test.
 *
 * Asserts the new port surface required by C4.1 design D1 / spec R6:
 *   - `KnowledgeRouterPort.resolve(searchTerm, signal?): Promise<KnowledgeRouterResult>`
 *   - `KnowledgeRouterResult` shape with `facts`, `source`, `fallback_triggered`,
 *     optional `judge_confidence`, optional `metadata.latencyMs.{kb,judge,web}`.
 *
 * No runtime side effects — verifies imports + `satisfies` against a literal
 * stub so that breaking the port shape fails this spec at TypeScript level.
 */
import type {
  KnowledgeRouterPort,
  KnowledgeRouterResult,
} from '@modules/chat/domain/ports/knowledge-router.port';

describe('KnowledgeRouterPort (T3.1)', () => {
  it('exposes a resolve(searchTerm, signal?) method returning KnowledgeRouterResult', () => {
    const stub: KnowledgeRouterPort = {
      // eslint-disable-next-line @typescript-eslint/require-await -- type-only smoke test
      async resolve(searchTerm: string, _signal?: AbortSignal): Promise<KnowledgeRouterResult> {
        return {
          facts: [`fact for ${searchTerm}`],
          source: 'wikidata',
          fallback_triggered: false,
          metadata: {
            searchTerm,
            latencyMs: { kb: 10 },
          },
        };
      },
    };

    expect(typeof stub.resolve).toBe('function');
  });

  it('accepts every documented source value (wikidata|web|none)', () => {
    const wd: KnowledgeRouterResult = {
      facts: [],
      source: 'wikidata',
      fallback_triggered: false,
      metadata: { searchTerm: 'x', latencyMs: {} },
    };
    const web: KnowledgeRouterResult = {
      facts: [],
      source: 'web',
      fallback_triggered: true,
      judge_confidence: 0.3,
      metadata: { searchTerm: 'x', latencyMs: { kb: 1, judge: 2, web: 3 } },
    };
    const none: KnowledgeRouterResult = {
      facts: [],
      source: 'none',
      fallback_triggered: false,
      metadata: { searchTerm: 'x', latencyMs: {} },
    };

    expect([wd.source, web.source, none.source]).toEqual(['wikidata', 'web', 'none']);
  });

  it('allows the signal parameter to be omitted', async () => {
    const stub: KnowledgeRouterPort = {
      // eslint-disable-next-line @typescript-eslint/require-await -- type-only smoke test
      async resolve(searchTerm: string): Promise<KnowledgeRouterResult> {
        return {
          facts: [],
          source: 'none',
          fallback_triggered: false,
          metadata: { searchTerm, latencyMs: {} },
        };
      },
    };

    const out = await stub.resolve('Mona Lisa');
    expect(out.source).toBe('none');
  });
});
