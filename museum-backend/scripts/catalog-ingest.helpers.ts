import { errorMessage } from '@shared/errors/error-message';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { logger } from '@shared/logger/logger';
import { wikimediaHttps } from '@shared/media/wikimedia-https';

import type { ArtworkMetadata } from '@modules/chat/domain/visual-similarity/compare-result.types';

const WIKIDATA_SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const WIKIDATA_USER_AGENT = 'Musaium/1.0 (https://musaium.fr; contact@musaium.fr)';

const WIKIDATA_LICENSE_URI_TO_SLUG: Readonly<Record<string, string>> = Object.freeze({
  'http://www.wikidata.org/entity/Q19652': 'public-domain',
  'http://www.wikidata.org/entity/Q6938433': 'cc-0',
  'http://www.wikidata.org/entity/Q20007257': 'cc-by-4.0',
  'http://www.wikidata.org/entity/Q6905323': 'cc-by',
  'http://www.wikidata.org/entity/Q18199165': 'cc-by-sa-4.0',
  'http://www.wikidata.org/entity/Q26921686': 'gfdl-1.2',
});

const WIKIDATA_ENTITY_URI_PREFIX = 'http://www.wikidata.org/entity/Q';

const WIKIDATA_QID_REGEX = /^Q[1-9][0-9]{0,18}$/;

export function validateWikidataQid(s: string): boolean {
  return WIKIDATA_QID_REGEX.test(s);
}

export function mapLicenseUriToSlug(uriOrSlug: string): string | null {
  if (uriOrSlug.length === 0) return null;
  if (!uriOrSlug.startsWith(WIKIDATA_ENTITY_URI_PREFIX)) {
    return uriOrSlug;
  }
  return WIKIDATA_LICENSE_URI_TO_SLUG[uriOrSlug] ?? null;
}

const RATE_LIMIT_DELAY_MS = 1_000;

export interface ArtworkSeed {
  qid: string;
  title: string;
  artist?: string;
  inception?: string;
  imageUrl: string;
  license: string;
  museumQid: string;
}

type SparqlBinding = Record<string, { value: string } | undefined>;

interface SparqlResponse {
  results: { bindings: SparqlBinding[] };
}

function buildArtworksOfMuseumSparql(museumQid: string, lang: string): string {
  if (!validateWikidataQid(museumQid)) {
    const truncated = museumQid.slice(0, 30);
    throw new Error(`catalog_ingest_invalid_qid: ${truncated}`);
  }
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

function extractQid(uri: string | undefined): string | undefined {
  if (uri === undefined) return undefined;
  const slash = uri.lastIndexOf('/');
  if (slash < 0) return undefined;
  const tail = uri.slice(slash + 1);
  return tail.length > 0 ? tail : undefined;
}

function cell(binding: SparqlBinding, key: string): string | undefined {
  return binding[key]?.value;
}

export async function* fetchArtworksOfMuseum(
  qid: string,
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
      error: errorMessage(err),
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
    const imageUrl = wikimediaHttps(cell(binding, 'image'));
    const licenseValue = cell(binding, 'license');
    const museumUri = cell(binding, 'museum');
    const museumQid = extractQid(museumUri) ?? qid;

    if (
      seedQid === undefined ||
      title === undefined ||
      imageUrl === undefined ||
      licenseValue === undefined
    ) {
      continue;
    }

    const mappedLicense = mapLicenseUriToSlug(licenseValue) ?? licenseValue;
    const seed: ArtworkSeed = {
      qid: seedQid,
      title,
      imageUrl,
      license: mappedLicense,
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

const hostnameNextAt = new Map<string, number>();

function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

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

export async function downloadThumbnail(url: string, maxBytes: number): Promise<Buffer> {
  await rateLimit(getHostname(url));
  return fetchThumbnail(url, maxBytes);
}

function assertWithinCap(body: Buffer, maxBytes: number, url: string): Buffer {
  if (body.byteLength > maxBytes) {
    throw new Error(
      `catalog_ingest_thumbnail_body_oversize: ${String(body.byteLength)} > maxBytes ${String(maxBytes)} for ${url}`,
    );
  }
  return body;
}

export async function fetchThumbnail(url: string, maxBytes: number): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': WIKIDATA_USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`catalog_ingest_thumbnail_non_ok: ${String(response.status)} for ${url}`);
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

  return assertWithinCap(Buffer.from(await response.arrayBuffer()), maxBytes, url);
}

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

const CSV_HEADER = 'qid,title,artist,license,museum_qid,image_url,image_file';
const CSV_COLUMN_COUNT = CSV_HEADER.split(',').length;

export interface CsvIngestSource {
  museumQids: string[];
  fetchArtworks: (museumQid: string) => AsyncIterable<ArtworkSeed>;
  download: (url: string, maxBytes: number) => Promise<Buffer>;
}

export async function readCsvCatalog(csvPath: string): Promise<CsvIngestSource> {
  const [header = '', ...rows] = (await readFile(csvPath, 'utf8')).split(/\r?\n/);
  if (header.trim() !== CSV_HEADER) {
    throw new Error(`catalog_ingest_csv_bad_header: expected ${CSV_HEADER}`);
  }
  const files = new Map<string, string>();
  const seeds: ArtworkSeed[] = [];
  rows.forEach((line, index) => {
    if (line.trim() === '') return;
    const cells = line.split(',').map((cell) => cell.trim());
    const [qid, title, artist, license, museumQid, imageUrl, imageFile] = cells;
    if (cells.length !== CSV_COLUMN_COUNT || cells.includes('') || files.has(imageUrl)) {
      throw new Error(`catalog_ingest_csv_bad_row: line ${String(index + 2)}`);
    }
    files.set(imageUrl, join(dirname(csvPath), imageFile));
    seeds.push({ qid, title, artist, license, museumQid, imageUrl });
  });

  return {
    museumQids: [...new Set(seeds.map((seed) => seed.museumQid))],
    fetchArtworks: async function* (museumQid) {
      yield* seeds.filter((seed) => seed.museumQid === museumQid);
    },
    download: async (url, maxBytes) => {
      const file = files.get(url);
      if (file === undefined) {
        throw new Error(`catalog_ingest_csv_unknown_image: ${url}`);
      }
      return assertWithinCap(await readFile(file), maxBytes, url);
    },
  };
}
