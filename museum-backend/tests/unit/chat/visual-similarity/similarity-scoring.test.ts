import { makeArtworkFacts } from '../../../helpers/chat/visual-similarity/artwork-facts.fixtures';

import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';

const scoring = require('@modules/chat/useCase/visual-similarity/similarity-scoring') as {
  computeMetadataScore: (query: ArtworkFacts | undefined, candidate: ArtworkFacts) => number;
  fuse: (visual: number, meta: number, weights: { wVisual: number; wMeta: number }) => number;
};

const { computeMetadataScore, fuse } = scoring;

describe('computeMetadataScore (T5.1 — pure scorer)', () => {
  it('returns 0 when the query is undefined (no metadata signal)', () => {
    const candidate = makeArtworkFacts();
    expect(computeMetadataScore(undefined, candidate)).toBe(0);
  });

  it('returns 0 when no attribute matches (fully disjoint facts)', () => {
    const query = makeArtworkFacts({
      qid: 'Q-other',
      title: 'Different',
      artist: 'Picasso',
      movement: 'Cubism',
      genre: 'still life',
      technique: 'Oil on canvas',
      date: '1907',
    });
    const candidate = makeArtworkFacts({
      qid: 'Q12418',
      artist: 'Leonardo da Vinci',
      movement: 'High Renaissance',
      genre: 'portrait',
      technique: 'Oil on poplar panel',
      date: 'c. 1503',
    });

    expect(computeMetadataScore(query, candidate)).toBe(0);
  });

  it('returns the maximum (capped at 1) when every attribute matches', () => {
    const query = makeArtworkFacts();
    const candidate = makeArtworkFacts();

    const score = computeMetadataScore(query, candidate);

    expect(score).toBeGreaterThan(0.95);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('awards the artist bonus (~0.4) when only the artist matches', () => {
    const query = makeArtworkFacts({
      artist: 'Leonardo da Vinci',
      movement: 'Different movement',
      genre: 'Different genre',
      technique: 'Different technique',
      date: '1900',
    });
    const candidate = makeArtworkFacts({
      artist: 'Leonardo da Vinci',
      movement: 'High Renaissance',
      genre: 'portrait',
      technique: 'Oil on poplar panel',
      date: 'c. 1503',
    });

    const score = computeMetadataScore(query, candidate);

    expect(score).toBeCloseTo(0.4, 2);
  });

  it('cumulates partial bonuses (artist + movement → ~0.6)', () => {
    const query = makeArtworkFacts({
      artist: 'Leonardo da Vinci',
      movement: 'High Renaissance',
      genre: 'Different genre',
      technique: 'Different technique',
      date: '1900',
    });
    const candidate = makeArtworkFacts();

    const score = computeMetadataScore(query, candidate);

    expect(score).toBeCloseTo(0.6, 2);
  });

  it('outputs a value in `[0, 1]` regardless of inputs', () => {
    const query = makeArtworkFacts();
    const candidate = makeArtworkFacts();

    const score = computeMetadataScore(query, candidate);

    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});

describe('fuse (T5.1 — pure scorer)', () => {
  it('returns the weighted sum for the canonical 0.7/0.3 split', () => {
    expect(fuse(1, 0, { wVisual: 0.7, wMeta: 0.3 })).toBeCloseTo(0.7, 6);
    expect(fuse(0, 1, { wVisual: 0.7, wMeta: 0.3 })).toBeCloseTo(0.3, 6);
    expect(fuse(0.8, 0.5, { wVisual: 0.7, wMeta: 0.3 })).toBeCloseTo(0.71, 6);
  });

  it('returns the visual score unchanged when wVisual=1, wMeta=0', () => {
    expect(fuse(0.42, 0.99, { wVisual: 1, wMeta: 0 })).toBeCloseTo(0.42, 6);
    expect(fuse(0, 0.5, { wVisual: 1, wMeta: 0 })).toBe(0);
    expect(fuse(1, 0.5, { wVisual: 1, wMeta: 0 })).toBe(1);
  });

  it('clamps the output to `[0, 1]` defensively', () => {
    expect(fuse(1, 1, { wVisual: 0.7, wMeta: 0.3 })).toBeLessThanOrEqual(1);
    expect(fuse(0, 0, { wVisual: 0.7, wMeta: 0.3 })).toBeGreaterThanOrEqual(0);
  });
});
