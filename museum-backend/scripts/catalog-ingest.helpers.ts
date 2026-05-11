/**
 * C3 Phase 7 — `catalog-ingest` helpers.
 *
 * Three concerns for the catalog ingestion CLI (`catalog-ingest.ts`):
 *
 *   1. {@link fetchArtworksOfMuseum} — issues a SPARQL query against the
 *      Wikidata public endpoint and yields one {@link ArtworkSeed} per row.
 *      Defensive parsing — rows missing mandatory bindings (qid, title,
 *      image, license, museum) collapse to a no-op (skipped silently) so a
 *      malformed result row never crashes the whole ingest.
 *
 *   2. {@link downloadThumbnail} — downloads a Wikimedia thumbnail with a
 *      polite per-hostname rate-limit (1 req/s) so the Wikimedia "polite"
 *      budget is respected. The limit is implemented in-process via a
 *      `Map<hostname, Promise>` chain — every call appends a 1s wait to the
 *      hostname's tail promise, so concurrent callers serialise on the
 *      same hostname but stay independent across hostnames.
 *
 *   3. {@link normalizeMetadata} — pure transform from the SPARQL seed shape
 *      to the {@link ArtworkMetadata} shape persisted alongside the
 *      embedding (drives the rendering of the FE compare card).
 *
 * The SPARQL endpoint, User-Agent header, and JSON binding shape mirror the
 * pattern used by `wikidata.client.ts` (READ-ONLY zone — we do not import
 * from it; this script lives outside the `src/` tree and must stay
 * standalone). The User-Agent uses the contact mailbox documented in
 * `wikidata.client.ts`.
 */
import { logger } from '@shared/logger/logger';

import type { ArtworkImageLicense } from '@modules/chat/domain/visual-similarity/artworkEmbedding.entity';
import type { ArtworkMetadata } from '@modules/chat/domain/visual-similarity/compare-result.types';

const WIKIDATA_SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const WIKIDATA_USER_AGENT = 'Musaium/1.0 (https://musaium.fr; contact@musaium.fr)';

/** Minimum delay between two requests targeting the same hostname (ms). */
const RATE_LIMIT_DELAY_MS = 1_000;

/**
 * One row produced by {@link fetchArtworksOfMuseum}. Mirrors the SPARQL
 * SELECT projection the catalog-ingest CLI needs to upsert one row of
 * `artwork_embeddings`. Optional bindings collapse to `undefined`.
 */
export interface ArtworkSeed {
  /** Wikidata QID extracted from `?item` (`http://www.wikidata.org/entity/Qxxx` → `Qxxx`). */
  qid: string;
  /** Localised label resolved via `SERVICE wikibase:label`. */
  title: string;
  /** Creator label, when bound. Optional in V1. */
  artist?: string;
  /** Inception date (ISO 8601 raw from Wikidata P571), when bound. */
  inception?: string;
  /** Direct Wikimedia Commons file URL (Special:FilePath). */
  imageUrl: string;
  /** License classification (free text from the SPARQL projection). */
  license: string;
  /** Wikidata QID of the holding museum. */
  museumQid: string;
}

/**
 * SPARQL JSON binding row shape: every cell is `{ value: string }`. Optional
 * cells are omitted from the dictionary. Mirrors what
 * `query.wikidata.org/sparql?format=json` returns.
 */
type SparqlBinding = Record<string, { value: string } | undefined>;

interface SparqlResponse {
  results: { bindings: SparqlBinding[] };
}

/**
 * Build the SPARQL query that lists artworks held by `museumQid`. Filtered
 * by P31/P279 (subclass-of painting | sculpture | drawing) so we keep the
 * artwork class without enumerating every possible subtype. The license
 * projection is best-effort: Wikidata stores license under different
 * predicates depending on the source; we expose `?license` as free text and
 * the CLI applies a downstream allowlist.
 *
 * @param museumQid - Wikidata QID of the museum (e.g. "Q19675" for Louvre).
 * @param lang - Wikidata language code for `wikibase:label` resolution.
 */
function buildArtworksOfMuseumSparql(museumQid: string, lang: string): string {
  return `
    SELECT ?item ?itemLabel ?creatorLabel ?inception ?image ?license ?museum
    WHERE {
      ?item wdt:P195 wd:${museumQid}.
      ?item wdt:P31/wdt:P279* wd:Q838948.
      ?item wdt:P18 ?image.
      OPTIONAL { ?item wdt:P170 ?creator. }
      OPTIONAL { ?item wdt:P571 ?inception. }
      OPTIONAL { ?item wdt:P275 ?license. }
      BIND(wd:${museumQid} AS ?museum)
      SERVICE wikibase:label { bd:serviceParam wikibase:language "${lang},en". }
    }
  `;
}

/**
 * Extract the trailing Wikidata QID from a full entity URL. Returns
 * `undefined` when the input is not a Wikidata URL or is missing.
 */
function extractQid(uri: string | undefined): string | undefined {
  if (uri === undefined) return undefined;
  const slash = uri.lastIndexOf('/');
  if (slash < 0) return undefined;
  const tail = uri.slice(slash + 1);
  return tail.length > 0 ? tail : undefined;
}

/**
 * Defensive accessor for a SPARQL binding cell. Returns the raw string
 * value or `undefined` when the cell is missing.
 */
function cell(binding: SparqlBinding, key: string): string | undefined {
  return binding[key]?.value;
}

/**
 * Issue a SPARQL query against `query.wikidata.org/sparql` and yield one
 * {@link ArtworkSeed} per usable binding. Bindings missing any of the
 * mandatory fields (qid, title, image, license, museumQid) are silently
 * dropped — see design.md §9 D8.
 *
 * Rate-limiting is the Wikidata default User-Agent + once-per-museum
 * SPARQL call; the per-thumbnail rate-limit lives in {@link downloadThumbnail}.
 *
 * @param qid - Wikidata QID of the museum to enumerate.
 * @param license - License allow-list (passed through; filtering is done by
 *   the CLI, not this generator — keeps the SPARQL projection cacheable).
 * @param lang - Language code for `wikibase:label` resolution.
 */
export async function* fetchArtworksOfMuseum(
  qid: string,
  // The license allow-list is intentionally accepted but not used here:
  // the upstream CLI filters by license after fetch (see catalog-ingest.ts).
  // Reserved for a future SPARQL-side prefilter optimisation.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for SPARQL-side prefilter optimisation; see catalog-ingest.ts. Approved-by: phase-7-architect
  license: ArtworkImageLicense[],
  lang: string,
): AsyncIterable<ArtworkSeed> {
  const sparql = buildArtworksOfMuseumSparql(qid, lang);
  const url = `${WIKIDATA_SPARQL_ENDPOINT}?query=${encodeURIComponent(sparql)}&format=json`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        'User-Agent': WIKIDATA_USER_AGENT,
        Accept: 'application/sparql-results+json',
      },
    });
  } catch (err) {
    logger.warn('catalog_ingest_sparql_fetch_failed', {
      museumQid: qid,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (!response.ok) {
    logger.warn('catalog_ingest_sparql_non_ok', {
      museumQid: qid,
      status: response.status,
    });
    return;
  }

  const payload = (await response.json()) as SparqlResponse;
  const bindings = payload.results?.bindings ?? [];

  for (const binding of bindings) {
    const seedQid = extractQid(cell(binding, 'item'));
    const title = cell(binding, 'itemLabel');
    const imageUrl = cell(binding, 'image');
    const licenseValue = cell(binding, 'license');
    const museumUri = cell(binding, 'museum');
    const museumQid = extractQid(museumUri) ?? qid;

    // Mandatory fields: qid + title + image + license. Skip otherwise.
    if (
      seedQid === undefined ||
      title === undefined ||
      imageUrl === undefined ||
      licenseValue === undefined
    ) {
      continue;
    }

    const seed: ArtworkSeed = {
      qid: seedQid,
      title,
      imageUrl,
      license: licenseValue,
      museumQid,
    };
    const artist = cell(binding, 'creatorLabel');
    if (artist !== undefined) {
      seed.artist = artist;
    }
    const inception = cell(binding, 'inception');
    if (inception !== undefined) {
      seed.inception = inception;
    }
    yield seed;
  }
}

/**
 * In-process per-hostname rate-limit gate. Stores the timestamp (ms since
 * epoch) at which the next request to a given hostname is allowed to fire.
 *
 * Timestamp-driven (rather than a promise chain) so test reruns under real
 * timers after a fake-timer test do not block on never-resolving setTimeouts
 * scheduled inside the previous test's fake-timer scope. `Date.now()` always
 * progresses monotonically across tests, so a stale future-in-fake-time
 * `nextAt` value naturally collapses to zero delay under real timers.
 */
const hostnameNextAt = new Map<string, number>();

/**
 * Extract the hostname from a URL, falling back to the raw input on parse
 * errors so the rate-limiter still produces a deterministic queue key.
 */
function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Rate-limit gate keyed by hostname. Awaits exactly the time needed for the
 * caller to be allowed to issue a request to `hostname`. The very first
 * call for a hostname resolves immediately; every subsequent call waits
 * at least {@link RATE_LIMIT_DELAY_MS} after the previous one was scheduled.
 */
async function rateLimit(hostname: string): Promise<void> {
  const now = Date.now();
  const previousNextAt = hostnameNextAt.get(hostname) ?? 0;
  const ready = Math.max(now, previousNextAt);
  const delay = ready - now;
  hostnameNextAt.set(hostname, ready + RATE_LIMIT_DELAY_MS);
  if (delay > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
}

/**
 * Download a thumbnail from `url` with a polite per-hostname rate-limit
 * (1 req/s/hostname). Throws when:
 *   - the response `Content-Length` header exceeds `maxBytes`,
 *   - the streamed body exceeds `maxBytes` (defensive — some servers omit
 *     `Content-Length`),
 *   - the response is not OK.
 *
 * @param url - Absolute URL of the thumbnail.
 * @param maxBytes - Hard cap on the response payload size.
 */
export async function downloadThumbnail(url: string, maxBytes: number): Promise<Buffer> {
  const hostname = getHostname(url);
  await rateLimit(hostname);

  const response = await fetch(url, {
    headers: {
      'User-Agent': WIKIDATA_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(
      `catalog_ingest_thumbnail_non_ok: ${String(response.status)} for ${url}`,
    );
  }

  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader !== null) {
    const declared = Number(contentLengthHeader);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new Error(
        `catalog_ingest_thumbnail_oversize: declared ${String(declared)} > maxBytes ${String(maxBytes)} for ${url}`,
      );
    }
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  if (buffer.byteLength > maxBytes) {
    throw new Error(
      `catalog_ingest_thumbnail_body_oversize: ${String(buffer.byteLength)} > maxBytes ${String(maxBytes)} for ${url}`,
    );
  }
  return buffer;
}

/**
 * Pure transform from a SPARQL {@link ArtworkSeed} into the
 * {@link ArtworkMetadata} shape stored alongside the embedding. Optional
 * fields collapse to `undefined` (omitted from the resulting object) so the
 * persisted JSON stays compact.
 */
export function normalizeMetadata(seed: ArtworkSeed): ArtworkMetadata {
  const metadata: ArtworkMetadata = {
    title: seed.title,
    imageUrl: seed.imageUrl,
    museumQid: seed.museumQid,
  };
  if (seed.artist !== undefined) {
    metadata.artist = seed.artist;
  }
  if (seed.inception !== undefined) {
    metadata.date = seed.inception;
  }
  return metadata;
}
