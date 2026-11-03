import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Museum } from '@modules/museum/domain/museum/museum.entity';

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

@Entity({ name: 'artwork_embeddings' })
@Index('IDX_artwork_embeddings_hnsw', { synchronize: false })
@Check(
  'CHK_artwork_embeddings_image_source',
  `"image_source" IN ('wikimedia', 'museum_api', 'manual')`,
)
@Check('CHK_artwork_embeddings_license', `"license" IN ('public-domain', 'cc-0')`)
export class ArtworkEmbedding {
  @PrimaryColumn({ type: 'text', name: 'qid' })
  qid!: string;

  @Index('IDX_artwork_embeddings_museum_qid')
  @Column({ type: 'text', name: 'museum_qid', nullable: true })
  museumQid?: string | null;

  @Index('IDX_artwork_embeddings_museum_id')
  @ForeignKey(() => Museum, { name: 'FK_artwork_embeddings_museum_id', onDelete: 'SET NULL' })
  @Column({ type: 'integer', name: 'museum_id', nullable: true })
  museumId?: number | null;

  @Column({ type: 'text', name: 'title' })
  title!: string;

  @Column({ type: 'text', name: 'image_url' })
  imageUrl!: string;

  @Column({ type: 'text', name: 'license' })
  license!: ArtworkImageLicense;

  @Column({ type: 'text', name: 'image_source' })
  imageSource!: ArtworkImageSource;

  @Column({ type: 'halfvec', length: 768, name: 'embedding' })
  embedding!: string;

  /** e.g. `"siglip2-base-patch16-224@v1"`. Used to invalidate/re-encode on upgrade. */
  @Column({ type: 'text', name: 'embedding_model_version' })
  embeddingModelVersion!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
