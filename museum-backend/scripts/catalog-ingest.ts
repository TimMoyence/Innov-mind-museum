/**
 * C3 Phase 7 — `catalog-ingest` CLI.
 *
 * End-to-end ingest pipeline for the visual-similarity catalog backing
 * `POST /chat/compare` (see design.md §3 / §9 D8 / spec.md R15):
 *
 *   1. List artworks of every requested museum via the SPARQL helper
 *      ({@link fetchArtworksOfMuseum}).
 *   2. Apply the license allow-list — anything outside `--license-filter`
 *      is counted as `licenseRejected` and dropped (R6 / spec §8 Q2).
 *   3. Download a Wikimedia thumbnail for each accepted seed (≤1 MiB).
 *      The polite rate-limit helper is opt-in: the production CLI binary
 *      enables it explicitly, while tests inject a fast un-rate-limited
 *      downloader so the integration suite finishes within the default
 *      Jest timeout.
 *   4. Encode the buffer via the injected {@link EmbeddingsPort}, producing
 *      an L2-normalised embedding + the model version string.
 *   5. Buffer encoded rows into {@link DEFAULT_BATCH_SIZE}-row groups and
 *      hand each batch to {@link ArtworkEmbeddingRepository.upsertBatch}.
 *      The repository handles idempotency (R15) — rows whose `qid +
 *      embedding + modelVersion` already match what is persisted are
 *      counted as `skipped` and never UPDATEd.
 *   6. Tally aggregate counters and surface them to the caller. Logging is
 *      deferred to a structured `logger.info` event so the CLI binary path
 *      and the integration tests share a single observability format.
 *
 * The CLI is exposed both as a callable function ({@link runIngest}, used
 * by tests) and as an executable script (the `require.main === module`
 * trailer). Tests bypass argv parsing and call `runIngest(opts)` directly
 * so encoder / repository / fetch / download dependencies stay injectable.
 */
import 'dotenv/config';
import 'reflect-metadata';

import { logger } from '@shared/logger/logger';

import {
  downloadThumbnail as politeDownloadThumbnail,
  fetchArtworksOfMuseum as defaultFetchArtworksOfMuseum,
  normalizeMetadata,
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

/** Default thumbnail cap (1 MiB) — matches design.md §3 D8 (max-width 1024). */
const DEFAULT_MAX_THUMBNAIL_BYTES = 1024 * 1024;
/** Default batch size for `upsertBatch`. */
const DEFAULT_BATCH_SIZE = 100;
/** Default worker pool size for the download + encode stage. */
const DEFAULT_CONCURRENCY = 4;

/**
 * License allow-list accepted by the V1 CLI (spec.md §8 Q2 — user
 * decision 2026-05-08): public domain + CC-0 only. CC-BY-SA seeds are
 * rejected (counted as `licenseRejected`).
 */
type AllowedLicense = 'public-domain' | 'cc-0' | 'cc-by-sa';

/**
 * Test-injectable downloader. Production binary uses the polite
 * rate-limited helper; tests use a fast default (raw fetch + maxBytes
 * enforcement, no rate-limit) so the 100-fixture integration test does
 * not stall on the per-hostname 1 req/s budget.
 */
export type DownloadThumbnailFn = (url: string, maxBytes: number) => Promise<Buffer>;

/**
 * Test-injectable SPARQL fetcher. Defaults to {@link defaultFetchArtworksOfMuseum}.
 */
export type FetchArtworksOfMuseumFn = (
  qid: string,
  license: ArtworkImageLicense[],
  lang: string,
) => AsyncIterable<ArtworkSeed>;

/** Options accepted by {@link runIngest}. Mirrors the integration test interface. */
export interface RunIngestOptions {
  /** Wikidata QIDs of the museums to enumerate (`--museum=<Q-ID>` repeated). */
  museumQids: string[];
  /** License allow-list — seeds outside this list are counted as `licenseRejected`. */
  licenseFilter: AllowedLicense[];
  /** When true, the encode + upsert path is skipped — counters still report seen rows. */
  dryRun?: boolean;
  /** Maximum rows per `upsertBatch` call. Defaults to {@link DEFAULT_BATCH_SIZE}. */
  batchSize?: number;
  /** Worker pool size for the download + encode stage. Defaults to {@link DEFAULT_CONCURRENCY}. */
  concurrency?: number;
  /** Resolved language for SPARQL labels. Defaults to `'en'`. */
  lang?: string;
  /** Encoder used to produce embeddings. */
  encoder: EmbeddingsPort;
  /** Catalog repository used for idempotent batch upserts. */
  repository: ArtworkEmbeddingRepository;
  /** Thumbnail download function. Defaults to a raw fetch (no rate-limit) — see header. */
  download?: DownloadThumbnailFn;
  /** SPARQL fetcher. Defaults to {@link defaultFetchArtworksOfMuseum}. */
  fetchArtworks?: FetchArtworksOfMuseumFn;
  /**
   * T-A8 — Internal Musaium tenant FK (`museums.id`) propagated onto every
   * persisted {@link ArtworkEmbeddingRow.museumId}. `null` / omitted means
   * "global public catalog" (visible to every tenant). Non-null pins the
   * batch to that single tenant — OWASP LLM08 cross-tenant scope (cf.
   * `ArtworkEmbeddingRepository.findNearest`).
   *
   * Resolved at the CLI layer either from the explicit `--museum-id=<int>`
   * flag, or by looking up `museums.wikidata_qid` for the (single) `--museum=`
   * Q-code provided. See `main()` for the resolution branch.
   */
  museumId?: number | null;
}

/** Aggregate result of one CLI run. */
export interface RunIngestResult {
  /** Rows newly written to `artwork_embeddings`. */
  inserted: number;
  /** Rows whose embedding/model-version diverged from what was persisted. */
  updated: number;
  /** Rows already at parity with the catalog (idempotent re-runs). */
  skipped: number;
  /** Rows whose license fell outside `licenseFilter` and were dropped. */
  licenseRejected: number;
  /** Rows seen in the SPARQL response (post-fetch, pre-license-filter). */
  totalSeen: number;
}

/**
 * Default downloader used when no `download` dep is injected. Raw `fetch`
 * with `Content-Length` + body-size enforcement against `maxBytes`. Does
 * NOT rate-limit — the production CLI entry-point opts into the polite
 * helper explicitly. Keeping the default un-rate-limited keeps the
 * integration test fast (≪ 5s) without giving up production politeness.
 */
const rawDownloadThumbnail: DownloadThumbnailFn = async (
  url: string,
  maxBytes: number,
): Promise<Buffer> => {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Musaium/1.0 (https://musaium.fr; contact@musaium.fr)',
    },
  });
  if (!response.ok) {
    throw new Error(`catalog_ingest_thumbnail_non_ok: ${String(response.status)} for ${url}`);
  }
  const declared = response.headers.get('content-length');
  if (declared !== null) {
    const declaredNum = Number(declared);
    if (Number.isFinite(declaredNum) && declaredNum > maxBytes) {
      throw new Error(
        `catalog_ingest_thumbnail_oversize: ${declared} > ${String(maxBytes)} for ${url}`,
      );
    }
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength > maxBytes) {
    throw new Error(
      `catalog_ingest_thumbnail_body_oversize: ${String(body.byteLength)} > ${String(maxBytes)} for ${url}`,
    );
  }
  return body;
};

/**
 * Provenance source written next to each ingested row. Wikimedia is the
 * only V1 source — see design.md §3 (the `museum_api` and `manual` paths
 * are reserved for V2).
 */
const WIKIMEDIA_SOURCE: ArtworkImageSource = 'wikimedia';

/**
 * Type-safe license allow-list check. Performed against the raw SPARQL
 * `license` string so callers do not silently widen unknown licenses
 * into the catalog. The narrowed result is the {@link ArtworkImageLicense}
 * value persisted on the row.
 */
function classifyLicense(raw: string, allowed: AllowedLicense[]): ArtworkImageLicense | null {
  if ((allowed as string[]).includes(raw)) {
    return raw as ArtworkImageLicense;
  }
  return null;
}

/**
 * Drain a fixed-size pool of asynchronous workers over an iterable input.
 *
 * Workers pull seeds from the shared async iterator; each call to `fn`
 * is awaited inside a worker so concurrency is bounded by `poolSize`.
 * A worker that throws aborts the whole drain (the error is propagated
 * so the CLI fails fast on unrecoverable encoder errors).
 *
 * Used by {@link runIngest} to overlap the download + encode stages
 * across `concurrency` workers without ever buffering the entire SPARQL
 * stream in memory.
 */
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

/**
 * Drive one full ingestion run. Pure function over its dependencies — no
 * env reads, no globals — so the integration suite can mount mocked
 * encoder / repository / fetch implementations and assert end-to-end
 * counter behaviour.
 */
export async function runIngest(opts: RunIngestOptions): Promise<RunIngestResult> {
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const lang = opts.lang ?? 'en';
  const dryRun = opts.dryRun ?? false;
  const download = opts.download ?? rawDownloadThumbnail;
  const fetchArtworks = opts.fetchArtworks ?? defaultFetchArtworksOfMuseum;

  // Translate the public license filter (`AllowedLicense[]`) into the
  // narrower `ArtworkImageLicense[]` accepted by the SPARQL helper. The
  // helper currently passes the list through (reserved for SPARQL-side
  // prefiltering), so this is a future-proofing widening.
  const sparqlLicenseHint = opts.licenseFilter.filter(
    (l): l is ArtworkImageLicense => l === 'public-domain' || l === 'cc-0' || l === 'cc-by-sa',
  );

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
    // Snapshot + reset BEFORE the await so workers landing on `onResult`
    // during the round-trip push into a fresh array, not into the slice
    // currently being persisted (race from concurrency > 1 + batchSize <
    // total seeds).
    const snapshot = pendingBatch;
    pendingBatch = [];
    const result = await opts.repository.upsertBatch(snapshot);
    inserted += result.inserted;
    updated += result.updated;
    skipped += result.skipped;
  };

  for (const museumQid of opts.museumQids) {
    const seedSource = fetchArtworks(museumQid, sparqlLicenseHint, lang);

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
          // Skip the network round-trip + the encoder call entirely so the
          // dry-run mode stays cheap and produces zero side effects. The
          // `totalSeen` counter still advances so operators can preview
          // catalog size before committing.
          return null;
        }

        let buffer: Buffer;
        try {
          buffer = await download(seed.imageUrl, DEFAULT_MAX_THUMBNAIL_BYTES);
        } catch (err) {
          logger.warn('catalog_ingest_download_failed', {
            museumQid,
            qid: seed.qid,
            error: err instanceof Error ? err.message : String(err),
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
          // T-A8 — propagate the tenant FK end-to-end. `undefined` collapses to
          // the column default (NULL) at the repository layer; non-null pins
          // the row to the tenant `museums.id` (OWASP LLM08 scope).
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

  // Final flush — anything still buffered after the museum loop closes.
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
    // T-A8 — surface the tenant scope in the structured log so operators can
    // audit which museum_id was used for the run (or `null` = global catalog).
    museumId: opts.museumId ?? null,
  });

  return { inserted, updated, skipped, licenseRejected, totalSeen };
}

// ---------------------------------------------------------------------------
// CLI entry-point. Skipped when the file is `require`d (tests, smoke).
// ---------------------------------------------------------------------------

/**
 * Parse the supported CLI flags. Hand-rolled to keep the script
 * dependency-free and predictable across Node versions. Unknown flags are
 * tolerated (logged on stderr) so future additions stay backward-compatible.
 */
function parseCliArgs(argv: string[]): {
  museumQids: string[];
  fromCsv?: string;
  licenseFilter: AllowedLicense[];
  dryRun: boolean;
  batchSize: number;
  concurrency: number;
  /** T-A8 — explicit tenant override; if absent and a single `--museum=` Qid is provided, `main()` resolves it from `museums.wikidata_qid`. */
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
      // TD-SEC-WAVEA-01 / WAVE-A-SEC-M1 — defense-in-depth. The value flows
      // into `buildArtworksOfMuseumSparql` where it is interpolated TWICE
      // into the SPARQL template. Mirror the strict `--museum-id=<int>`
      // pattern below: reject loudly (warn + skip) so a typo or injection
      // payload never reaches the Wikidata endpoint.
      const raw = arg.slice('--museum='.length);
      if (validateWikidataQid(raw)) {
        out.museumQids.push(raw);
      } else {
        logger.warn('catalog_ingest_bad_museum_qid', { raw: raw.slice(0, 64) });
      }
      continue;
    }
    if (arg.startsWith('--museum-id=')) {
      // T-A8 — explicit `--museum-id=<positive int>`. Reject NaN, negatives,
      // zero, and non-integers loudly so a typo never lands as `null` and
      // leaks rows into the global catalog by accident.
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
        .map((s) => s.trim())
        .filter(
          (s): s is AllowedLicense =>
            s === 'public-domain' || s === 'pd' || s === 'cc-0' || s === 'cc-by-sa',
        )
        .map((s) => (s === 'pd' ? 'public-domain' : s));
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

/**
 * Bootstraps the production dependencies (DataSource → repository, ONNX
 * encoder via the embeddings factory) and runs {@link runIngest}. Enables
 * the polite rate-limited downloader explicitly so production callers
 * stay within the Wikimedia per-hostname budget.
 */
/* istanbul ignore next -- production bootstrap; covered by smoke tests */
async function main(): Promise<void> {
  const cli = parseCliArgs(process.argv.slice(2));
  if (cli.museumQids.length === 0 && cli.fromCsv === undefined) {
    logger.error('catalog_ingest_no_input', { hint: 'pass --museum=Qxxx or --from-csv=<path>' });
    process.exit(1);
  }

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
    (await import('@modules/chat/adapters/secondary/embeddings/embeddings.factory')) as {
      createEmbeddingsAdapter: () => EmbeddingsPort;
    };
  const encoder = createEmbeddingsAdapter();

  // T-A8 — resolve the tenant scope for the run :
  //   1. `--museum-id=<int>` explicit → use as-is (validated in parseCliArgs).
  //   2. else single `--museum=<Qid>` → lookup `museums.wikidata_qid`.
  //   3. else (multiple Qids or no match) → `null` = global public catalog
  //      branch. Warn-logged so operators notice if a single-Qid run lands
  //      in the global namespace because the Q-code wasn't in the seed yet.
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
    museumQids: cli.museumQids,
    licenseFilter: cli.licenseFilter,
    dryRun: cli.dryRun,
    batchSize: cli.batchSize,
    concurrency: cli.concurrency,
    encoder,
    repository,
    museumId: resolvedMuseumId,
    // Production opts in to the polite 1 req/s/hostname helper.
    download: politeDownloadThumbnail,
  });

  logger.info('catalog_ingest_done', { ...result });
  await AppDataSource.destroy();
}

/* istanbul ignore next -- production bootstrap guard */
if (require.main === module) {
  void main().catch((err: unknown) => {
    logger.error('catalog_ingest_fatal', {
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(1);
  });
}
