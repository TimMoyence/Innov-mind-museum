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
 * - `wikimedia` — Wikidata P18 / Wikimedia Commons.
 * - `museum_api` — direct museum collection API (RMN, Met, Rijksmuseum).
 * - `manual` — operator-curated upload via CLI ingest.
 */
export type ArtworkImageSource = 'wikimedia' | 'museum_api' | 'manual';

/**
 * Only permissive licenses are ingested. `unknown` is a safety bucket for
 * sources without a usable license tag — filtered out at retrieval (design §7).
 */
export type ArtworkImageLicense = 'public-domain' | 'cc-0' | 'cc-by-sa' | 'unknown';

/**
 * One SigLIP embedding per artwork variant (Wikidata QID). `embedding` stored
 * as `text` (TypeORM has no native `halfvec`). Phase 3 migration casts to
 * `halfvec(768)` + HNSW index. Repositories use raw queries with explicit
 * `::halfvec` casts.
 */
@Entity({ name: 'artwork_embeddings' })
@Check(
  'CHK_artwork_embeddings_image_source',
  `"image_source" IN ('wikimedia', 'museum_api', 'manual')`,
)
@Check('CHK_artwork_embeddings_license', `"license" IN ('public-domain', 'cc-0')`)
export class ArtworkEmbedding {
  @PrimaryColumn({ type: 'text', name: 'qid' })
  qid!: string;

  /** Indexed non-unique so `museumQids` filter prunes HNSW candidate set without a scan. */
  @Index('IDX_artwork_embeddings_museum_qid')
  @Column({ type: 'text', name: 'museum_qid', nullable: true })
  museumQid?: string | null;

  /**
   * Internal Musaium tenant FK (`museums.id`). Distinct from {@link museumQid}
   * (Wikidata public reference). NULL = **global public catalog** visible to
   * every tenant; non-NULL = **tenant-private**.
   *
   * Flat integer (no `@ManyToOne` Relation) because the repository uses raw SQL
   * exclusively (`halfvec` cast); a relation would force TypeORM joins on
   * hand-written queries. FK declared at DB layer in migration
   * `AddMuseumIdScopeToArtworkEmbeddings1778622760826`.
   *
   * OWASP LLM08 — `findNearest()` scopes by `museum_id IS NULL OR museum_id =
   * $tenantId` so tenants can never receive another tenant's private match.
   */
  @Index('IDX_artwork_embeddings_museum_id')
  @Column({ type: 'integer', name: 'museum_id', nullable: true })
  museumId?: number | null;

  /** Resolved language at ingestion (typically EN). */
  @Column({ type: 'text', name: 'title' })
  title!: string;

  @Column({ type: 'text', name: 'image_url' })
  imageUrl!: string;

  /** CHECK constraint at SQL (Phase 3). Allowed values sync with {@link ArtworkImageLicense}. */
  @Column({ type: 'text', name: 'license' })
  license!: ArtworkImageLicense;

  /** CHECK constraint at SQL (Phase 3). Allowed values sync with {@link ArtworkImageSource}. */
  @Column({ type: 'text', name: 'image_source' })
  imageSource!: ArtworkImageSource;

  /**
   * pgvector-compatible literal (e.g. `"[0.123,-0.456,...]"`, length 768).
   * Stored as `text` in TypeORM, cast to `halfvec(768)` in raw SQL (`::halfvec`).
   * L2-normalised at encode time so inner-product `<#>` ≡ cosine (design §9 D2).
   */
  @Column({ type: 'text', name: 'embedding' })
  embedding!: string;

  /** e.g. `"siglip2-base-patch16-224@v1"`. Used to invalidate/re-encode on upgrade. */
  @Column({ type: 'text', name: 'embedding_model_version' })
  embeddingModelVersion!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
