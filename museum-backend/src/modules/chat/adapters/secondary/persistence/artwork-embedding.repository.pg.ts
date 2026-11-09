import { logger } from '@shared/logger/logger';
import { wikimediaHttps } from '@shared/media/wikimedia-https';

import type { ArtworkEmbedding } from '@modules/chat/domain/visual-similarity/artworkEmbedding.entity';
import type {
  ArtworkEmbeddingRepository,
  ArtworkEmbeddingRow,
  FindNearestOptions,
  UpsertBatchResult,
} from '@modules/chat/domain/visual-similarity/artworkEmbedding.repository.interface';
import type {
  ArtworkMetadata,
  NearestResult,
} from '@modules/chat/domain/visual-similarity/compare-result.types';
import type { DataSource, EntityManager } from 'typeorm';

interface ArtworkEmbeddingSqlRow {
  qid: string;
  museum_qid: string | null;
  museum_id: number | null;
  title: string;
  artist: string | null;
  image_url: string;
  license: ArtworkEmbedding['license'];
  image_source: ArtworkEmbedding['imageSource'];
  embedding: string;
  embedding_model_version: string;
  created_at: Date;
  updated_at: Date;
}

interface ArtworkEmbeddingNearestSqlRow extends ArtworkEmbeddingSqlRow {
  similarity: number | string;
}

const serialiseVector = (vector: Float32Array): string => `[${Array.from(vector).join(',')}]`;

const ROW_CASTS = {
  qid: 'text',
  museum_qid: 'text',
  museum_id: 'integer',
  title: 'text',
  artist: 'text',
  image_url: 'text',
  license: 'text',
  image_source: 'text',
  embedding: 'halfvec',
  embedding_model_version: 'text',
} as const;
const ROW_COLUMNS = Object.keys(ROW_CASTS).join(', ');

const rowValues = (
  rows: ArtworkEmbeddingRow[],
): { values: string; params: (string | number | null)[] } => {
  const casts = Object.values(ROW_CASTS);
  const placeholder = (row: number, column: number): string =>
    '$' + String(row * casts.length + column + 1) + '::' + casts[column];
  return {
    values: rows
      .map((_, row) => `(${casts.map((_cast, column) => placeholder(row, column)).join(', ')})`)
      .join(', '),
    params: rows.flatMap((row) => [
      row.qid,
      row.metadata.museumQid ?? null,
      row.museumId ?? null,
      row.metadata.title,
      row.metadata.artist ?? null,
      row.metadata.imageUrl,
      row.license,
      row.imageSource,
      serialiseVector(row.vector),
      row.embeddingModelVersion,
    ]),
  };
};

const toEntity = (row: ArtworkEmbeddingSqlRow): ArtworkEmbedding => ({
  qid: row.qid,
  museumQid: row.museum_qid,
  museumId: row.museum_id,
  title: row.title,
  artist: row.artist,
  imageUrl: wikimediaHttps(row.image_url),
  license: row.license,
  imageSource: row.image_source,
  embedding: row.embedding,
  embeddingModelVersion: row.embedding_model_version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toNearestMetadata = (row: ArtworkEmbeddingSqlRow): ArtworkMetadata => {
  const metadata: ArtworkMetadata = {
    title: row.title,
    imageUrl: wikimediaHttps(row.image_url),
  };
  if (row.museum_qid !== null) {
    metadata.museumQid = row.museum_qid;
  }
  if (row.artist !== null) {
    metadata.artist = row.artist;
  }
  return metadata;
};

export class ArtworkEmbeddingRepositoryPg implements ArtworkEmbeddingRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findNearest(
    query: Float32Array,
    topN: number,
    opts: FindNearestOptions = {},
  ): Promise<NearestResult[]> {
    const queryLiteral = serialiseVector(query);
    const museumQids = opts.museumQids ?? null;
    const museumId = typeof opts.museumId === 'number' ? opts.museumId : null;
    if (museumId === null) {
      logger.warn('artwork_embeddings_find_nearest_unscoped', {
        reason: 'museumId not provided — global read (cross-tenant scope disabled)',
        topN,
        museumQidsCount: museumQids?.length ?? 0,
      });
    }

    const rows: ArtworkEmbeddingNearestSqlRow[] = await this.dataSource.query(
      `SELECT qid, museum_qid, museum_id, title, artist, image_url, license, image_source,
              embedding, embedding_model_version, created_at, updated_at,
              ((1 - (embedding <#> $1::halfvec)) / 2) AS similarity
       FROM artwork_embeddings
       WHERE ($2::text[] IS NULL OR museum_qid = ANY($2::text[]))
         AND ($4::integer IS NULL OR museum_id IS NULL OR museum_id = $4::integer)
       ORDER BY embedding <#> $1::halfvec
       LIMIT $3`,
      [queryLiteral, museumQids, topN, museumId],
    );

    return rows.map((row) => ({
      qid: row.qid,
      visualScore: typeof row.similarity === 'string' ? Number(row.similarity) : row.similarity,
      metadata: toNearestMetadata(row),
      modelVersion: row.embedding_model_version,
    }));
  }

  async upsertBatch(rows: ArtworkEmbeddingRow[]): Promise<UpsertBatchResult> {
    if (rows.length === 0) {
      return { inserted: 0, updated: 0, skipped: 0 };
    }

    return await this.dataSource.transaction(async (manager) => {
      const counts = await this.classifyRows(manager, rows);
      const toWrite = rows.filter((_, index) => !counts.skipMask[index]);
      if (toWrite.length > 0) {
        await this.writeBatch(manager, toWrite);
      }
      return {
        inserted: counts.inserted,
        updated: counts.updated,
        skipped: counts.skipped,
      };
    });
  }

  private async classifyRows(
    manager: EntityManager,
    rows: ArtworkEmbeddingRow[],
  ): Promise<{
    inserted: number;
    updated: number;
    skipped: number;
    skipMask: boolean[];
  }> {
    const { values, params } = rowValues(rows);
    const sql = `
      WITH input(${ROW_COLUMNS}) AS (VALUES ${values})
      SELECT i.qid AS qid,
             (e.qid IS NULL) AS is_insert,
             COALESCE(e.qid IS NOT NULL
                      AND e.embedding = i.embedding
                      AND (e.museum_qid, e.museum_id, e.title, e.artist, e.image_url, e.license,
                           e.image_source, e.embedding_model_version)
                          IS NOT DISTINCT FROM
                          (i.museum_qid, i.museum_id, i.title, i.artist, i.image_url, i.license,
                           i.image_source, i.embedding_model_version), false) AS is_skip
      FROM input i
      LEFT JOIN artwork_embeddings e ON e.qid = i.qid
    `;
    const classified: { qid: string; is_insert: boolean; is_skip: boolean }[] = await manager.query(
      sql,
      params,
    );

    const byQid = new Map<string, { is_insert: boolean; is_skip: boolean }>();
    for (const row of classified) {
      byQid.set(row.qid, { is_insert: row.is_insert, is_skip: row.is_skip });
    }

    const skipMask: boolean[] = Array.from({ length: rows.length }, () => false);
    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    for (const [idx, row] of rows.entries()) {
      const verdict = byQid.get(row.qid);
      if (!verdict) {
        inserted += 1;
        continue;
      }
      if (verdict.is_skip) {
        skipped += 1;
        skipMask[idx] = true;
      } else if (verdict.is_insert) {
        inserted += 1;
      } else {
        updated += 1;
      }
    }

    return { inserted, updated, skipped, skipMask };
  }

  private async writeBatch(manager: EntityManager, rows: ArtworkEmbeddingRow[]): Promise<void> {
    const { values, params } = rowValues(rows);
    const sql = `
      INSERT INTO artwork_embeddings (${ROW_COLUMNS})
      VALUES ${values}
      ON CONFLICT (qid) DO UPDATE SET
        museum_qid              = EXCLUDED.museum_qid,
        museum_id               = EXCLUDED.museum_id,
        title                   = EXCLUDED.title,
        artist                  = EXCLUDED.artist,
        image_url               = EXCLUDED.image_url,
        license                 = EXCLUDED.license,
        image_source            = EXCLUDED.image_source,
        embedding               = EXCLUDED.embedding,
        embedding_model_version = EXCLUDED.embedding_model_version,
        updated_at              = now()
    `;
    await manager.query(sql, params);
  }

  async findByQid(qid: string): Promise<ArtworkEmbedding | null> {
    const rows: ArtworkEmbeddingSqlRow[] = await this.dataSource.query(
      `SELECT qid, museum_qid, museum_id, title, artist, image_url, license, image_source,
              embedding, embedding_model_version, created_at, updated_at
       FROM artwork_embeddings
       WHERE qid = $1
       LIMIT 1`,
      [qid],
    );
    if (rows.length === 0) {
      return null;
    }
    return toEntity(rows[0]);
  }
}
