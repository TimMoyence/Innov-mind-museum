import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Provenance of the catalog image associated with an embedding.
 *
 * - `wikimedia` — Wikidata P18 / Wikimedia Commons.
 * - `museum_api` — direct museum collection API (e.g. RMN, Met, Rijksmuseum).
 * - `manual` — operator-curated upload via CLI ingest.
 */
export type ArtworkImageSource = 'wikimedia' | 'museum_api' | 'manual';

/**
 * License classification for the catalog image. Restricted set: only
 * permissive licenses are ingested. `unknown` is a safety bucket for catalog
 * sources that did not return a usable license tag — those entries are
 * filtered out at retrieval time per design §7 (no attribution risk).
 */
export type ArtworkImageLicense = 'public-domain' | 'cc-0' | 'cc-by-sa' | 'unknown';

/**
 * Catalog row backing the visual-similarity engine.
 *
 * Stores one SigLIP embedding per artwork variant identified by Wikidata QID.
 * The `embedding` field is persisted as `text` here (TypeORM has no native
 * `halfvec` type). The corresponding SQL migration (Phase 3) casts the column
 * to `halfvec(768)` and adds the HNSW index. Repository implementations use
 * raw queries with explicit `::halfvec` casts when reading / writing.
 *
 * See {@link file://./compare-result.types.ts} for downstream result shapes.
 */
@Entity({ name: 'artwork_embeddings' })
@Check(
  'CHK_artwork_embeddings_image_source',
  `"image_source" IN ('wikimedia', 'museum_api', 'manual')`,
)
@Check('CHK_artwork_embeddings_license', `"license" IN ('public-domain', 'cc-0')`)
export class ArtworkEmbedding {
  /** Wikidata QID acting as the primary key (e.g. "Q12418"). One row per artwork variant. */
  @PrimaryColumn({ type: 'text', name: 'qid' })
  qid!: string;

  /**
   * Wikidata QID of the museum that holds the artwork, when known.
   *
   * Indexed (non-unique) so the repository's optional `museumQids` filter can
   * prune the HNSW candidate set without a full table scan.
   */
  @Index('IDX_artwork_embeddings_museum_qid')
  @Column({ type: 'text', name: 'museum_qid', nullable: true })
  museumQid?: string | null;

  /**
   * Internal Musaium tenant FK (`museums.id`). Distinct from {@link museumQid}
   * (Wikidata public reference). NULL means the row belongs to the **global
   * public catalog** (Wikimedia / public museum APIs) and is visible to every
   * tenant; non-NULL means the row is **tenant-private** to that museum.
   *
   * Modeled as a flat integer column (no `@ManyToOne` Relation) because the
   * repository goes through raw SQL exclusively (`halfvec` cast — see file
   * header). Adding a relation here would force TypeORM to surface a join on
   * every hand-written query, which we never want. The FK constraint is
   * declared at the DB layer in migration
   * `AddMuseumIdScopeToArtworkEmbeddings1778622760826`.
   *
   * OWASP LLM08 — `findNearest()` scopes by `museum_id IS NULL OR museum_id =
   * $tenantId` so a tenant can never receive a private match owned by another
   * tenant.
   */
  @Index('IDX_artwork_embeddings_museum_id')
  @Column({ type: 'integer', name: 'museum_id', nullable: true })
  museumId?: number | null;

  /** Canonical artwork title (resolved language at ingestion time, typically EN). */
  @Column({ type: 'text', name: 'title' })
  title!: string;

  /** Direct image URL (Wikimedia thumb or museum CDN). Used by the FE carousel. */
  @Column({ type: 'text', name: 'image_url' })
  imageUrl!: string;

  /**
   * License class. CHECK constraint enforced at SQL level (Phase 3 migration).
   * Allowed values must stay in sync with {@link ArtworkImageLicense}.
   */
  @Column({ type: 'text', name: 'license' })
  license!: ArtworkImageLicense;

  /**
   * Provenance of the image. CHECK constraint enforced at SQL level
   * (Phase 3 migration). Allowed values must stay in sync with
   * {@link ArtworkImageSource}.
   */
  @Column({ type: 'text', name: 'image_source' })
  imageSource!: ArtworkImageSource;

  /**
   * SigLIP embedding serialized as a pgvector-compatible literal
   * (e.g. `"[0.123,-0.456,...]"`, length 768). Stored as `text` in TypeORM
   * and cast to `halfvec(768)` in raw SQL queries (`::halfvec`).
   *
   * The vector is L2-normalised at encode time so inner-product search
   * (`<#>`) is equivalent to cosine — see ADR / design §9 D2.
   */
  @Column({ type: 'text', name: 'embedding' })
  embedding!: string;

  /**
   * Identifier for the SigLIP model + version that produced this embedding
   * (e.g. `"siglip-base-patch16-224@v1"`). Used to invalidate / re-encode
   * when the model is upgraded.
   */
  @Column({ type: 'text', name: 'embedding_model_version' })
  embeddingModelVersion!: string;

  /** Row creation timestamp (timezone-aware). */
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  /** Row last-update timestamp (timezone-aware). */
  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
