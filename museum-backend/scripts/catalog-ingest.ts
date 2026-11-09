import 'dotenv/config';
import 'reflect-metadata';

import { env } from '@src/config/env';
import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';

import {
  downloadThumbnail as politeDownloadThumbnail,
  fetchArtworksOfMuseum as defaultFetchArtworksOfMuseum,
  fetchThumbnail,
  normalizeMetadata,
  readCsvCatalog,
  validateWikidataQid,
  type ArtworkSeed,
} from './catalog-ingest.helpers';

import type {
  ArtworkImageLicense,
  ArtworkImageSource,
} from '@modules/chat/domain/visual-similarity/artworkEmbedding.entity';
import type { EmbeddingsPort } from '@modules/chat/domain/ports/embeddings.port';
import type {
  ArtworkEmbeddingRepository,
  ArtworkEmbeddingRow,
} from '@modules/chat/domain/visual-similarity/artworkEmbedding.repository.interface';

const DEFAULT_MAX_THUMBNAIL_BYTES = 1024 * 1024;
const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_CONCURRENCY = 4;

type AllowedLicense = 'public-domain' | 'cc-0' | 'cc-by-sa';

export type DownloadThumbnailFn = (url: string, maxBytes: number) => Promise<Buffer>;

export type FetchArtworksOfMuseumFn = (qid: string, lang: string) => AsyncIterable<ArtworkSeed>;

export interface RunIngestOptions {
  museumQids: string[];
  licenseFilter: AllowedLicense[];
  dryRun?: boolean;
  batchSize?: number;
  concurrency?: number;
  lang?: string;
  encoder: EmbeddingsPort;
  repository: ArtworkEmbeddingRepository;
  download?: DownloadThumbnailFn;
  fetchArtworks?: FetchArtworksOfMuseumFn;
  museumId?: number | null;
}

export interface RunIngestResult {
  inserted: number;
  updated: number;
  skipped: number;
  licenseRejected: number;
  totalSeen: number;
}

const WIKIMEDIA_SOURCE: ArtworkImageSource = 'wikimedia';

function classifyLicense(raw: string, allowed: AllowedLicense[]): ArtworkImageLicense | null {
  if ((allowed as string[]).includes(raw)) {
    return raw as ArtworkImageLicense;
  }
  return null;
}

async function drainWithPool<T, R>(
  source: AsyncIterable<T>,
  poolSize: number,
  fn: (item: T) => Promise<R | null>,
  onResult: (result: R) => Promise<void>,
): Promise<void> {
  const iterator = source[Symbol.asyncIterator]();
  let exhausted = false;

  const worker = async (): Promise<void> => {
    while (!exhausted) {
      const next = await iterator.next();
      if (next.done === true) {
        exhausted = true;
        return;
      }
      const result = await fn(next.value);
      if (result !== null) {
        await onResult(result);
      }
    }
  };

  const workers = Array.from({ length: Math.max(1, poolSize) }, () => worker());
  await Promise.all(workers);
}

export async function runIngest(opts: RunIngestOptions): Promise<RunIngestResult> {
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const lang = opts.lang ?? 'en';
  const dryRun = opts.dryRun ?? false;
  const download = opts.download ?? fetchThumbnail;
  const fetchArtworks = opts.fetchArtworks ?? defaultFetchArtworksOfMuseum;

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let licenseRejected = 0;
  let totalSeen = 0;

  let pendingBatch: ArtworkEmbeddingRow[] = [];

  const flush = async (): Promise<void> => {
    if (pendingBatch.length === 0 || dryRun) {
      pendingBatch = [];
      return;
    }
    const snapshot = pendingBatch;
    pendingBatch = [];
    const result = await opts.repository.upsertBatch(snapshot);
    inserted += result.inserted;
    updated += result.updated;
    skipped += result.skipped;
  };

  for (const museumQid of opts.museumQids) {
    const seedSource = fetchArtworks(museumQid, lang);

    await drainWithPool<ArtworkSeed, ArtworkEmbeddingRow>(
      seedSource,
      concurrency,
      async (seed) => {
        totalSeen += 1;
        const license = classifyLicense(seed.license, opts.licenseFilter);
        if (license === null) {
          licenseRejected += 1;
          return null;
        }

        if (dryRun) {
          return null;
        }

        let buffer: Buffer;
        try {
          buffer = await download(seed.imageUrl, DEFAULT_MAX_THUMBNAIL_BYTES);
        } catch (err) {
          logger.warn('catalog_ingest_download_failed', {
            museumQid,
            qid: seed.qid,
            error: errorMessage(err),
          });
          return null;
        }

        const encoded = await opts.encoder.encode({
          buffer,
          mimeType: 'image/jpeg',
        });

        const row: ArtworkEmbeddingRow = {
          qid: seed.qid,
          vector: encoded.vector,
          metadata: normalizeMetadata(seed),
          imageSource: WIKIMEDIA_SOURCE,
          license,
          embeddingModelVersion: encoded.modelVersion,
          museumId: opts.museumId ?? null,
        };
        return row;
      },
      async (row) => {
        pendingBatch.push(row);
        if (pendingBatch.length >= batchSize) {
          await flush();
        }
      },
    );
  }

  await flush();

  logger.info('catalog_ingest_summary', {
    inserted,
    updated,
    skipped,
    licenseRejected,
    totalSeen,
    dryRun,
    batchSize,
    concurrency,
    museumId: opts.museumId ?? null,
  });

  return { inserted, updated, skipped, licenseRejected, totalSeen };
}

function parseCliArgs(argv: string[]): {
  museumQids: string[];
  fromCsv?: string;
  licenseFilter: AllowedLicense[];
  dryRun: boolean;
  batchSize: number;
  concurrency: number;
  museumId?: number;
} {
  const out: {
    museumQids: string[];
    fromCsv?: string;
    licenseFilter: AllowedLicense[];
    dryRun: boolean;
    batchSize: number;
    concurrency: number;
    museumId?: number;
  } = {
    museumQids: [],
    licenseFilter: ['public-domain', 'cc-0'],
    dryRun: false,
    batchSize: DEFAULT_BATCH_SIZE,
    concurrency: DEFAULT_CONCURRENCY,
  };

  for (const arg of argv) {
    if (arg.startsWith('--museum=')) {
      const raw = arg.slice('--museum='.length);
      if (validateWikidataQid(raw)) {
        out.museumQids.push(raw);
      } else {
        logger.warn('catalog_ingest_bad_museum_qid', { raw: raw.slice(0, 64) });
      }
      continue;
    }
    if (arg.startsWith('--museum-id=')) {
      const raw = arg.slice('--museum-id='.length);
      const parsed = Number.parseInt(raw, 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        out.museumId = parsed;
      } else {
        logger.warn('catalog_ingest_bad_museum_id', { raw });
      }
      continue;
    }
    if (arg.startsWith('--from-csv=')) {
      out.fromCsv = arg.slice('--from-csv='.length);
      continue;
    }
    if (arg.startsWith('--license-filter=')) {
      const value = arg.slice('--license-filter='.length);
      out.licenseFilter = value
        .split(',')
        .map((s) => (s.trim() === 'pd' ? 'public-domain' : s.trim()))
        .filter(
          (s): s is AllowedLicense => s === 'public-domain' || s === 'cc-0' || s === 'cc-by-sa',
        );
      continue;
    }
    if (arg === '--dry-run') {
      out.dryRun = true;
      continue;
    }
    if (arg.startsWith('--batch-size=')) {
      const value = Number(arg.slice('--batch-size='.length));
      if (Number.isFinite(value) && value > 0) {
        out.batchSize = value;
      }
      continue;
    }
    if (arg.startsWith('--concurrency=')) {
      const value = Number(arg.slice('--concurrency='.length));
      if (Number.isFinite(value) && value > 0) {
        out.concurrency = value;
      }
      continue;
    }
  }

  return out;
}

export async function ingestSourceOf(cli: {
  museumQids: string[];
  fromCsv?: string;
}): Promise<Pick<RunIngestOptions, 'museumQids' | 'download' | 'fetchArtworks'>> {
  if (cli.fromCsv === undefined) {
    return { museumQids: cli.museumQids, download: politeDownloadThumbnail };
  }
  if (cli.museumQids.length > 0) {
    throw new Error('catalog_ingest_conflicting_input: pass --from-csv or --museum, not both');
  }
  return readCsvCatalog(cli.fromCsv);
}

async function main(): Promise<void> {
  const cli = parseCliArgs(process.argv.slice(2));
  if (cli.museumQids.length === 0 && cli.fromCsv === undefined) {
    logger.error('catalog_ingest_no_input', { hint: 'pass --museum=Qxxx or --from-csv=<path>' });
    process.exit(1);
  }
  const source = await ingestSourceOf(cli);

  const { AppDataSource } = (await import('@data/db/data-source')) as {
    AppDataSource: import('typeorm').DataSource;
  };
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const { ArtworkEmbeddingRepositoryPg } =
    (await import('@modules/chat/adapters/secondary/persistence/artwork-embedding.repository.pg')) as {
      ArtworkEmbeddingRepositoryPg: new (
        ds: import('typeorm').DataSource,
      ) => ArtworkEmbeddingRepository;
    };
  const repository = new ArtworkEmbeddingRepositoryPg(AppDataSource);

  const { createEmbeddingsAdapter } =
    await import('@modules/chat/adapters/secondary/embeddings/embeddings.factory');
  const encoder = createEmbeddingsAdapter(env);

  let resolvedMuseumId: number | null = cli.museumId ?? null;
  if (resolvedMuseumId === null && cli.museumQids.length === 1) {
    const targetQid = cli.museumQids[0];
    const { Museum } = (await import('@modules/museum/domain/museum/museum.entity')) as {
      Museum: new () => { id: number; wikidataQid?: string | null };
    };
    const museumRepo = AppDataSource.getRepository(Museum);
    const found = await museumRepo
      .createQueryBuilder('m')
      .select(['m.id'])
      .where('m.wikidataQid = :qid', { qid: targetQid })
      .getOne();
    if (found && typeof found.id === 'number') {
      resolvedMuseumId = found.id;
      logger.info('catalog_ingest_resolved_museum_id', { qid: targetQid, museumId: found.id });
    } else {
      logger.warn('catalog_ingest_museum_qid_unresolved', {
        qid: targetQid,
        hint: 'no museums row with wikidata_qid matches; ingesting into global catalog (museum_id=NULL)',
      });
    }
  } else if (resolvedMuseumId === null && cli.museumQids.length > 1) {
    logger.warn('catalog_ingest_multi_qid_global_branch', {
      count: cli.museumQids.length,
      hint: 'pass --museum-id=<int> to pin batch to one tenant',
    });
  }

  const result = await runIngest({
    licenseFilter: cli.licenseFilter,
    dryRun: cli.dryRun,
    batchSize: cli.batchSize,
    concurrency: cli.concurrency,
    encoder,
    repository,
    museumId: resolvedMuseumId,
    ...source,
  });

  logger.info('catalog_ingest_done', { ...result });
  await AppDataSource.destroy();
}

if (require.main === module) {
  void main().catch((err: unknown) => {
    logger.error('catalog_ingest_fatal', {
      error: errorMessage(err),
    });
    process.exit(1);
  });
}
