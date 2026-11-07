import { makeCache } from '../../../helpers/chat/cache.fixtures';
import { makeArtworkFacts } from '../../../helpers/chat/visual-similarity/artwork-facts.fixtures';
import { makeSiglipJpegBuffer } from '../../../helpers/chat/visual-similarity/image-fixtures';
import {
  makeArtworkMetadata,
  makeEncodeOutput,
  makeNearestResult,
} from '../../../helpers/chat/visual-similarity/compare.fixtures';

import { VisualSimilarityService } from '@modules/chat/useCase/visual-similarity/similarity.service';

import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';
import type { CacheService } from '@shared/cache/cache.port';

const neighbour = (qid: string, visualScore = 0.9) =>
  makeNearestResult({ qid, visualScore, metadata: makeArtworkMetadata({ title: qid }) });
const NEIGHBOURS = [neighbour('Q1000'), neighbour('Q1001')];

function compareWith(
  facts: Map<string, ArtworkFacts>,
  cache: jest.Mocked<CacheService>,
  neighbours = NEIGHBOURS,
): Promise<unknown> {
  const service = new VisualSimilarityService({
    encoder: { encode: jest.fn().mockResolvedValue(makeEncodeOutput()) },
    repo: {
      findNearest: jest.fn().mockResolvedValue(neighbours),
      upsertBatch: jest.fn(),
      findByQid: jest.fn(),
      count: jest.fn(),
    },
    enricher: { enrichBatch: jest.fn().mockResolvedValue(facts) },
    cache,
    reranker: { rerank: jest.fn() },
    weights: { wVisual: 0.7, wMeta: 0.3 },
  });
  return makeSiglipJpegBuffer().then((buffer) =>
    service.compare({ buffer, mimeType: 'image/jpeg', topK: 5, locale: 'fr' }),
  );
}

describe('VisualSimilarityService — cache des résultats après une panne de Wikidata', () => {
  it('MAESTRO-CHAT · une comparaison dont toutes les voisines ont leurs faits Wikidata se garde en cache', async () => {
    const cache = makeCache();
    const facts = new Map(NEIGHBOURS.map(({ qid }) => [qid, makeArtworkFacts({ qid })]));

    await compareWith(facts, cache);

    expect(cache.set).toHaveBeenCalledTimes(1);
  });

  it('MAESTRO-CHAT · une comparaison où Wikidata s’est tu sur une voisine ne se garde pas en cache, la suivante retente Wikidata', async () => {
    const cache = makeCache();
    const facts = new Map([['Q1000', makeArtworkFacts({ qid: 'Q1000' })]]);

    await compareWith(facts, cache);

    expect(cache.set).not.toHaveBeenCalled();
  });

  it('MAESTRO-CHAT · une voisine sans faits Wikidata mais trop lointaine pour être montrée n’empêche pas le cache', async () => {
    const cache = makeCache();
    const facts = new Map(NEIGHBOURS.map(({ qid }) => [qid, makeArtworkFacts({ qid })]));

    await compareWith(facts, cache, [...NEIGHBOURS, neighbour('Q1099', 0.1)]);

    expect(cache.set).toHaveBeenCalledTimes(1);
  });
});
