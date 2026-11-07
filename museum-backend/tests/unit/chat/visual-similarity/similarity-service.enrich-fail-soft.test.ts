import { makeCache } from '../../../helpers/chat/cache.fixtures';
import { makeArtworkFacts } from '../../../helpers/chat/visual-similarity/artwork-facts.fixtures';
import { makeSiglipJpegBuffer } from '../../../helpers/chat/visual-similarity/image-fixtures';
import {
  makeArtworkMetadata,
  makeEncodeOutput,
  makeNearestResult,
} from '../../../helpers/chat/visual-similarity/compare.fixtures';

import { VisualSimilarityService } from '@modules/chat/useCase/visual-similarity/similarity.service';
import { WikidataEnricher } from '@modules/chat/useCase/visual-similarity/wikidata-enricher';

import type { EmbeddingsPort, EncodeOutput } from '@modules/chat/domain/ports/embeddings.port';
import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';
import type { RerankerPort } from '@modules/chat/domain/ports/reranker.port';
import type {
  ArtworkEmbeddingRepository,
  FindNearestOptions,
} from '@modules/chat/domain/visual-similarity/artworkEmbedding.repository.interface';
import type { NearestResult } from '@modules/chat/domain/visual-similarity/compare-result.types';

function makeNeighbours(n: number): NearestResult[] {
  return Array.from({ length: n }, (_, i) =>
    makeNearestResult({
      qid: `Q${1000 + i}`,
      visualScore: Math.max(0, 1 - i * 0.01),
      metadata: makeArtworkMetadata({
        title: `Artwork ${i}`,
        imageUrl: `https://commons.wikimedia.org/img/${i}.jpg`,
      }),
    }),
  );
}

function makeService(
  neighbours: NearestResult[],
  lookup: (query: { searchTerm: string }) => Promise<ArtworkFacts | null>,
): VisualSimilarityService {
  const encoder: jest.Mocked<EmbeddingsPort> = {
    encode: jest
      .fn<Promise<EncodeOutput>, [Parameters<EmbeddingsPort['encode']>[0]]>()
      .mockResolvedValue(makeEncodeOutput()),
  };
  const repo: jest.Mocked<ArtworkEmbeddingRepository> = {
    findNearest: jest
      .fn<Promise<NearestResult[]>, [Float32Array, number, FindNearestOptions?]>()
      .mockResolvedValue(neighbours),
    upsertBatch: jest.fn(),
    findByQid: jest.fn(),
    count: jest.fn(),
  };
  const reranker: jest.Mocked<RerankerPort> = { rerank: jest.fn() };
  return new VisualSimilarityService({
    encoder,
    repo,
    enricher: new WikidataEnricher({ client: { lookup }, cache: makeCache() }),
    cache: makeCache(),
    reranker,
    weights: { wVisual: 0.7, wMeta: 0.3 },
  });
}

describe('VisualSimilarityService — Wikidata muet pendant la comparaison', () => {
  let buffer: Buffer;

  beforeAll(async () => {
    buffer = await makeSiglipJpegBuffer();
  });

  it('MAESTRO-CHAT · Wikidata muet sur toutes les voisines : chaque œuvre reconnue garde sa carte du catalogue (titre, artiste, photo), classée sur le score visuel', async () => {
    const lookup = jest.fn().mockRejectedValue(new Error('Wikidata 504'));
    const service = makeService(makeNeighbours(3), lookup);

    const result = await service.compare({ buffer, mimeType: 'image/jpeg', topK: 5, locale: 'fr' });

    expect(lookup).toHaveBeenCalled();
    expect(result.fallbackReason).not.toBe('no_visual_neighbor');
    expect(result.matches.map(({ qid, title, imageUrl }) => ({ qid, title, imageUrl }))).toEqual([
      { qid: 'Q1000', title: 'Artwork 0', imageUrl: 'https://commons.wikimedia.org/img/0.jpg' },
      { qid: 'Q1001', title: 'Artwork 1', imageUrl: 'https://commons.wikimedia.org/img/1.jpg' },
      { qid: 'Q1002', title: 'Artwork 2', imageUrl: 'https://commons.wikimedia.org/img/2.jpg' },
    ]);
    expect(result.matches[0]?.facts).toEqual({
      qid: 'Q1000',
      title: 'Artwork 0',
      artist: 'Leonardo da Vinci',
      imageUrl: 'https://commons.wikimedia.org/img/0.jpg',
    });
  });

  it('MAESTRO-CHAT · Wikidata muet sur une seule voisine : elle garde sa carte du catalogue, les autres prennent les faits Wikidata', async () => {
    const lookup = jest.fn(async ({ searchTerm }: { searchTerm: string }) => {
      if (searchTerm === 'Q1001') throw new Error('Wikidata 503');
      return makeArtworkFacts({ qid: searchTerm, title: `Title ${searchTerm}` });
    });
    const service = makeService(makeNeighbours(3), lookup);

    const result = await service.compare({ buffer, mimeType: 'image/jpeg', topK: 5, locale: 'fr' });

    expect(result.matches.map(({ qid, title }) => ({ qid, title }))).toEqual([
      { qid: 'Q1000', title: 'Title Q1000' },
      { qid: 'Q1001', title: 'Artwork 1' },
      { qid: 'Q1002', title: 'Title Q1002' },
    ]);
  });
});
