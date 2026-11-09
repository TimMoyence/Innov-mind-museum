import { makeArtworkFacts } from './artwork-facts.fixtures';
import { EMBEDDING_DIM, makeNormalisedFloat32 } from './embedding.fixtures';

import type { EncodeOutput } from '@modules/chat/domain/ports/embeddings.port';
import type {
  ArtworkMetadata,
  CompareMatch,
  CompareResult,
  NearestResult,
} from '@modules/chat/domain/visual-similarity/compare-result.types';

export const DEFAULT_MODEL_VERSION = 'siglip2-base-patch16-224@v1';

export const makeArtworkMetadata = (overrides: Partial<ArtworkMetadata> = {}): ArtworkMetadata => ({
  title: 'Mona Lisa',
  artist: 'Leonardo da Vinci',
  date: 'c. 1503',
  museumQid: 'Q19675',
  technique: 'Oil on poplar panel',
  movement: 'High Renaissance',
  genre: 'portrait',
  imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Mona_Lisa.jpg',
  thumbnailUrl:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa.jpg/300px-Mona_Lisa.jpg',
  ...overrides,
});

export const makeNearestResult = (overrides: Partial<NearestResult> = {}): NearestResult => ({
  qid: 'Q12418',
  visualScore: 0.9,
  metadata: makeArtworkMetadata(),
  modelVersion: DEFAULT_MODEL_VERSION,
  ...overrides,
});

export const makeCompareMatch = (overrides: Partial<CompareMatch> = {}): CompareMatch => ({
  qid: 'Q12418',
  title: 'Mona Lisa',
  imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Mona_Lisa.jpg',
  thumbnailUrl:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa.jpg/300px-Mona_Lisa.jpg',
  visualScore: 0.9,
  metadataScore: 0,
  finalScore: 0.63,
  rationale: 'Œuvre similaire',
  facts: makeArtworkFacts(),
  ...overrides,
});

export const makeCompareResult = (overrides: Partial<CompareResult> = {}): CompareResult => ({
  matches: [makeCompareMatch()],
  durationMs: 1234,
  modelVersion: DEFAULT_MODEL_VERSION,
  ...overrides,
});

export const makeEncodeOutput = (overrides: Partial<EncodeOutput> = {}): EncodeOutput => ({
  vector: makeNormalisedFloat32(0, EMBEDDING_DIM),
  modelVersion: DEFAULT_MODEL_VERSION,
  ...overrides,
});
