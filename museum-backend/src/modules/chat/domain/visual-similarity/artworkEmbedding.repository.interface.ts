import type { ArtworkEmbedding } from './artworkEmbedding.entity';
import type { ArtworkMetadata, NearestResult } from './compare-result.types';

export interface ArtworkEmbeddingRow {
  qid: string;
  vector: Float32Array;
  metadata: ArtworkMetadata;
  imageSource: ArtworkEmbedding['imageSource'];
  license: ArtworkEmbedding['license'];
  embeddingModelVersion: string;
  museumId?: number | null;
}

export interface FindNearestOptions {
  museumQids?: string[];

  museumId?: number | null;
}

export interface UpsertBatchResult {
  inserted: number;
  updated: number;
  skipped: number;
}

export interface ArtworkEmbeddingRepository {
  findNearest(
    query: Float32Array,
    topN: number,
    opts?: FindNearestOptions,
  ): Promise<NearestResult[]>;

  upsertBatch(rows: ArtworkEmbeddingRow[]): Promise<UpsertBatchResult>;

  findByQid(qid: string): Promise<ArtworkEmbedding | null>;
}
