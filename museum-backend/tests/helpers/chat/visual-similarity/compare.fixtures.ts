/**
 * Shared factories for the visual-similarity *compare pipeline* test suite —
 * Phase 5 (use-cases + composition root) and Phase 6 (HTTP route).
 *
 * Per CLAUDE.md test discipline (UFR-002), no test file may build a
 * {@link NearestResult}, {@link CompareMatch}, {@link CompareResult},
 * {@link ArtworkMetadata}, {@link SharedAttribute} or `EncodeOutput` literal
 * inline — go through the factories below so default shapes stay consistent
 * across unit + integration tiers.
 *
 * The factories pair with {@link makeArtworkFacts} (Wikidata-shaped facts) and
 * {@link makeNormalisedFloat32} (768-dim L2-normalised vectors). Default
 * artwork is the Mona Lisa to match the rest of the visual-similarity suite.
 */
import { makeArtworkFacts } from './artwork-facts.fixtures';
import { EMBEDDING_DIM, makeNormalisedFloat32 } from './embedding.fixtures';

import type { EncodeOutput } from '@modules/chat/domain/ports/embeddings.port';
import type {
  ArtworkMetadata,
  CompareMatch,
  CompareResult,
  NearestResult,
} from '@modules/chat/domain/visual-similarity/compare-result.types';

/** Canonical model version stamp used by the SigLIP-base default. */
export const DEFAULT_MODEL_VERSION = 'siglip2-base-patch16-224@v1';

/**
 * Build an {@link ArtworkMetadata} payload with sensible defaults.
 *
 * @param overrides - partial overrides; missing keys fall back to the Mona Lisa.
 */
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

/**
 * Build a {@link NearestResult} (raw kNN row before enrichment / fusion).
 *
 * @param overrides - partial overrides; missing keys fall back to the Mona Lisa.
 */
export const makeNearestResult = (overrides: Partial<NearestResult> = {}): NearestResult => ({
  qid: 'Q12418',
  visualScore: 0.9,
  metadata: makeArtworkMetadata(),
  modelVersion: DEFAULT_MODEL_VERSION,
  ...overrides,
});

/**
 * Build a {@link CompareMatch} (post-enrichment, post-fusion top-K row).
 *
 * @param overrides - partial overrides; missing keys fall back to the Mona Lisa.
 */
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

/**
 * Build a {@link CompareResult} (top-level pipeline response).
 *
 * @param overrides - partial overrides; missing keys default to one Mona Lisa match.
 */
export const makeCompareResult = (overrides: Partial<CompareResult> = {}): CompareResult => ({
  matches: [makeCompareMatch()],
  durationMs: 1234,
  modelVersion: DEFAULT_MODEL_VERSION,
  ...overrides,
});

/**
 * Build an {@link EncodeOutput} payload for tests that mock `EmbeddingsPort.encode`.
 *
 * Default vector is the unit-vector at component 0 (orthogonal to other seeds),
 * matching {@link makeNormalisedFloat32} so kNN tests can pair encode + repo
 * fixtures by `seedIndex`.
 *
 * @param overrides - partial overrides; vector defaults to seedIndex 0.
 */
export const makeEncodeOutput = (overrides: Partial<EncodeOutput> = {}): EncodeOutput => ({
  vector: makeNormalisedFloat32(0, EMBEDDING_DIM),
  modelVersion: DEFAULT_MODEL_VERSION,
  ...overrides,
});
