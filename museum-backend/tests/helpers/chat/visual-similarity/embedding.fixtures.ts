/**
 * Shared factories for the visual-similarity / `artwork_embeddings` test suite.
 *
 * Per CLAUDE.md test discipline (UFR-002), no test file may construct
 * embedding literals or `ArtworkEmbedding`-shaped rows inline. Go through
 * these helpers so the dimension, format, and license/source enums stay
 * consistent across unit + integration + e2e tiers.
 *
 * Helpers exposed:
 *   - {@link makeHalfvecLiteral}    → pgvector-compatible string literal
 *   - {@link makeArtworkEmbeddingRow} → flat row shape for raw SQL inserts
 *
 * The `embedding` column is stored as `text` in the TypeORM entity but cast
 * to `halfvec(768)` in raw SQL queries (see design.md §4 + R13). For test
 * rows inserted via raw SQL we wrap the literal in `::halfvec` — the helper
 * only produces the string body so callers stay explicit about the cast.
 */
import type { ArtworkImageLicense, ArtworkImageSource } from '@modules/chat/domain/visual-similarity/artworkEmbedding.entity';

/** SigLIP-base-patch16-224 output dimensionality (design.md §9 D1). */
export const EMBEDDING_DIM = 768;

/**
 * Build a deterministic pgvector literal of a given dimension.
 *
 * The output looks like `"[0.1,0.1,...,0.1]"` — exactly the format pgvector
 * accepts for both `vector(N)` and `halfvec(N)` casts. Default value is a
 * uniform `0.1` so every component is well within `halfvec` range
 * (`±65 504`) and the resulting vector is non-zero (zero vectors break
 * inner-product ranking).
 *
 * For tests that need the vector to be L2-normalised, pick a value such
 * that `value * sqrt(dim) ≈ 1` (e.g. `1 / Math.sqrt(768) ≈ 0.0361` for
 * a fully-normalised constant vector).
 *
 * @param value - per-component value, default `0.1`.
 * @param dim   - vector dimension, default {@link EMBEDDING_DIM} (768).
 */
export const makeHalfvecLiteral = (value = 0.1, dim: number = EMBEDDING_DIM): string => {
  const components = Array<number>(dim).fill(value);
  return `[${components.join(',')}]`;
};

/**
 * Properties of a synthetic `artwork_embeddings` row, keyed by *snake_case*
 * column names so callers can drop the object straight into a raw INSERT.
 *
 * Matches the SQL DDL planned in design.md §4 (Phase 3 migration):
 *   - `qid` (PK), `museum_qid` (nullable), `title`, `image_url`,
 *   - `license` ∈ {public-domain, cc-0} (V1 spec §8 Q2),
 *   - `image_source` ∈ {wikimedia, museum_api, manual},
 *   - `embedding` = halfvec(768) literal,
 *   - `embedding_model_version`,
 *   - `created_at` / `updated_at` (defaulted by Postgres `now()`).
 */
export interface ArtworkEmbeddingRowFixture {
  qid: string;
  museum_qid: string | null;
  title: string;
  image_url: string;
  license: ArtworkImageLicense;
  image_source: ArtworkImageSource;
  /** halfvec(768) literal — call sites must apply `::halfvec` in the SQL. */
  embedding: string;
  embedding_model_version: string;
}

/**
 * Build a synthetic `artwork_embeddings` row with sensible defaults.
 *
 * Per V1 spec resolution (`§8 Q2`, 2026-05-08), the default `license` is
 * `'public-domain'` — the only other accepted V1 value is `'cc-0'`.
 *
 * @param overrides - partial column overrides; missing keys fall back to
 *   the deterministic defaults documented above.
 */
export const makeArtworkEmbeddingRow = (
  overrides: Partial<ArtworkEmbeddingRowFixture> = {},
): ArtworkEmbeddingRowFixture => ({
  qid: 'Q12418', // Wikidata QID for "Mona Lisa"
  museum_qid: 'Q19675', // Wikidata QID for "Louvre"
  title: 'Mona Lisa',
  image_url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa.jpg/600px-Mona_Lisa.jpg',
  license: 'public-domain',
  image_source: 'wikimedia',
  embedding: makeHalfvecLiteral(),
  embedding_model_version: 'siglip-base-patch16-224@v1',
  ...overrides,
});

/**
 * Build a deterministic L2-normalised `Float32Array` for the embedding port
 * tests. The default shape is a single non-zero component at `seedIndex` so
 * the resulting vector is unit-length AND distinguishable across rows
 * (any two seeds produce orthogonal vectors → predictable inner-product
 * ranking when used in repository round-trip tests).
 *
 * The `dim`-th index wraps around with modulo so a caller asking for
 * `seedIndex >= dim` still gets a unit vector without overflow.
 *
 * Use {@link makeNormalisedVectorLiteral} when you need the pgvector text
 * literal form for raw SQL inserts (mirrors the byte-for-byte content of
 * the array — same component placement).
 *
 * @param seedIndex - 0-based component to set to 1. Default 0.
 * @param dim - Vector dimension. Default {@link EMBEDDING_DIM} (768).
 */
export const makeNormalisedFloat32 = (
  seedIndex = 0,
  dim: number = EMBEDDING_DIM,
): Float32Array => {
  const vec = new Float32Array(dim);
  vec[seedIndex % dim] = 1;
  return vec;
};

/**
 * Same logic as {@link makeNormalisedFloat32} but returns the pgvector
 * literal `"[v1,v2,...]"` form so callers can drop it straight into a raw
 * INSERT (with `::halfvec` cast).
 *
 * Pairs row-for-row with {@link makeNormalisedFloat32} when seeded with the
 * same `seedIndex` — same vector, two serialisations.
 *
 * @param seedIndex - 0-based component to set to 1. Default 0.
 * @param dim - Vector dimension. Default {@link EMBEDDING_DIM} (768).
 */
export const makeNormalisedVectorLiteral = (
  seedIndex = 0,
  dim: number = EMBEDDING_DIM,
): string => {
  const components = Array<number>(dim).fill(0);
  components[seedIndex % dim] = 1;
  return `[${components.join(',')}]`;
};
