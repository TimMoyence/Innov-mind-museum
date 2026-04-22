import { logger } from '@shared/logger/logger';

const USER_AGENT = 'Musaium/1.0 (https://musaium.app; contact@musaium.app)';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
const DEFAULT_TIMEOUT_MS = 5_000;
/** Max distance (metres) between museum coords and a Wikidata candidate to be considered a match. */
const COORDS_MATCH_RADIUS_M = 500;

/** Result of a QID lookup — `confidence` decays with the fallback method used. */
export interface WikidataMuseumMatch {
  qid: string;
  label: string;
  confidence: 'high' | 'medium' | 'low';
  method: 'name+city' | 'name+coords' | 'name-only';
}

/** Structured facts extracted from a Wikidata museum entity. */
export interface WikidataMuseumFacts {
  qid: string;
  label: string;
  summary: string | null;
  website: string | null;
  phone: string | null;
  imageUrl: string | null;
  wikipediaTitle: string | null;
}

/** Port-like interface so the use case + tests can substitute a stub client. */
export interface WikidataMuseumClient {
  findMuseumQid(input: {
    name: string;
    lat?: number;
    lng?: number;
    locale: string;
  }): Promise<WikidataMuseumMatch | null>;

  fetchFacts(input: { qid: string; locale: string }): Promise<WikidataMuseumFacts | null>;
}

function isValidLanguageCode(lang: string): boolean {
  return /^[a-z]{2,3}$/i.test(lang);
}

/** Escapes a user-supplied value for safe SPARQL string literal interpolation. */
function escapeSparqlLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
}

type HeadersObject = Record<string, string>;

function mergeHeaders(extra: HeadersObject | undefined): HeadersObject {
  const base: HeadersObject = { 'User-Agent': USER_AGENT };
  if (!extra) return base;
  return { ...base, ...extra };
}

interface FetchWithTimeoutInit extends Omit<RequestInit, 'headers'> {
  headers?: HeadersObject;
  timeoutMs?: number;
}

async function fetchWithTimeout(url: string, init: FetchWithTimeoutInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: mergeHeaders(init.headers),
    });
  } finally {
    clearTimeout(timeout);
  }
}

/** Haversine distance (metres). */
function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Default HTTP-backed implementation of {@link WikidataMuseumClient}.
 * Fail-open on every external call — returns `null` instead of throwing.
 */
export class HttpWikidataMuseumClient implements WikidataMuseumClient {
  /**
   * Resolves a museum name → Wikidata QID. Strategy:
   *
   *   1. SPARQL against `P31/P279* wd:Q33506` (museum class hierarchy) filtering
   *      entities whose localised label matches the name.
   *   2. If coordinates supplied and several candidates returned, keep the
   *      one within {@link COORDS_MATCH_RADIUS_M} metres.
   *   3. Last-resort fallback: `wbsearchentities` free-text search.
   */
  async findMuseumQid(input: {
    name: string;
    lat?: number;
    lng?: number;
    locale: string;
  }): Promise<WikidataMuseumMatch | null> {
    const language = isValidLanguageCode(input.locale) ? input.locale.toLowerCase() : 'en';
    try {
      const sparqlCandidates = await this.sparqlByLabel(input.name, language);
      if (sparqlCandidates.length > 0) {
        return this.pickBestCandidate(sparqlCandidates, input);
      }
      return await this.searchFallback(input.name, language);
    } catch (err) {
      logger.warn('wikidata_museum_find_qid_error', {
        name: input.name,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /** Fetches structured facts for a resolved QID. Fail-open. */
  async fetchFacts(input: { qid: string; locale: string }): Promise<WikidataMuseumFacts | null> {
    if (!/^Q\d+$/.test(input.qid)) return null;
    const language = isValidLanguageCode(input.locale) ? input.locale.toLowerCase() : 'en';
    try {
      const [sparqlFacts, sitelinkTitle] = await Promise.all([
        this.sparqlFacts(input.qid, language),
        this.fetchSitelinkTitle(input.qid, language),
      ]);
      if (!sparqlFacts) return null;
      return { ...sparqlFacts, wikipediaTitle: sitelinkTitle };
    } catch (err) {
      logger.warn('wikidata_museum_fetch_facts_error', {
        qid: input.qid,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  // ── internals ────────────────────────────────────────────────

  private async sparqlByLabel(
    name: string,
    language: string,
  ): Promise<{ qid: string; label: string; lat?: number; lng?: number }[]> {
    const safeName = escapeSparqlLiteral(name);
    const sparql = `
      SELECT ?item ?itemLabel ?coord WHERE {
        ?item wdt:P31/wdt:P279* wd:Q33506 .
        ?item rdfs:label "${safeName}"@${language} .
        OPTIONAL { ?item wdt:P625 ?coord. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "${language},en". }
      }
      LIMIT 5`;

    const res = await fetchWithTimeout(
      `${WIKIDATA_SPARQL}?query=${encodeURIComponent(sparql)}&format=json`,
      { headers: { Accept: 'application/sparql-results+json' } },
    );
    if (!res.ok) return [];

    const data = (await res.json()) as {
      results: {
        bindings: {
          item: { value: string };
          itemLabel?: { value: string };
          coord?: { value: string };
        }[];
      };
    };

    return data.results.bindings
      .map((b) => {
        const qidMatch = /Q\d+$/.exec(b.item.value);
        if (!qidMatch) return null;
        const coord = parseWktPoint(b.coord?.value);
        return {
          qid: qidMatch[0],
          label: b.itemLabel?.value ?? name,
          ...(coord ?? {}),
        };
      })
      .filter((x): x is { qid: string; label: string; lat?: number; lng?: number } => x !== null);
  }

  private pickBestCandidate(
    candidates: { qid: string; label: string; lat?: number; lng?: number }[],
    input: { lat?: number; lng?: number },
  ): WikidataMuseumMatch {
    if (candidates.length === 1) {
      return {
        qid: candidates[0].qid,
        label: candidates[0].label,
        confidence: 'high',
        method: 'name+city',
      };
    }
    if (input.lat != null && input.lng != null) {
      const userCoord = { lat: input.lat, lng: input.lng };
      const geo = candidates
        .filter(
          (c): c is { qid: string; label: string; lat: number; lng: number } =>
            c.lat != null && c.lng != null,
        )
        .map((c) => ({
          ...c,
          dist: distanceMetres(userCoord, { lat: c.lat, lng: c.lng }),
        }))
        .filter((c) => c.dist < COORDS_MATCH_RADIUS_M)
        .sort((a, b) => a.dist - b.dist);
      const best = geo.at(0);
      if (best) {
        return { qid: best.qid, label: best.label, confidence: 'high', method: 'name+coords' };
      }
    }
    return {
      qid: candidates[0].qid,
      label: candidates[0].label,
      confidence: 'medium',
      method: 'name-only',
    };
  }

  private async searchFallback(
    name: string,
    language: string,
  ): Promise<WikidataMuseumMatch | null> {
    const params = new URLSearchParams({
      action: 'wbsearchentities',
      search: name,
      language,
      type: 'item',
      limit: '3',
      format: 'json',
    });
    const res = await fetchWithTimeout(`${WIKIDATA_API}?${params.toString()}`, {});
    if (!res.ok) return null;
    const data = (await res.json()) as {
      search: { id: string; label: string; description?: string }[];
    };
    const first = data.search.at(0);
    if (!first) return null;
    return { qid: first.id, label: first.label, confidence: 'low', method: 'name-only' };
  }

  private async sparqlFacts(
    qid: string,
    language: string,
  ): Promise<Omit<WikidataMuseumFacts, 'wikipediaTitle'> | null> {
    const sparql = `
      SELECT ?itemLabel ?description ?website ?phone ?image WHERE {
        BIND(wd:${qid} AS ?item)
        OPTIONAL { ?item schema:description ?description . FILTER(LANG(?description) = "${language}") }
        OPTIONAL { ?item wdt:P856 ?website. }
        OPTIONAL { ?item wdt:P1329 ?phone. }
        OPTIONAL { ?item wdt:P18 ?image. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "${language},en". }
      }
      LIMIT 1`;
    const res = await fetchWithTimeout(
      `${WIKIDATA_SPARQL}?query=${encodeURIComponent(sparql)}&format=json`,
      { headers: { Accept: 'application/sparql-results+json' } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results: { bindings: Record<string, { value: string } | undefined>[] };
    };
    const row = data.results.bindings.at(0);
    if (!row) return null;
    const get = (k: string): string | null => row[k]?.value ?? null;
    return {
      qid,
      label: get('itemLabel') ?? qid,
      summary: get('description'),
      website: get('website'),
      phone: get('phone'),
      imageUrl: get('image'),
    };
  }

  private async fetchSitelinkTitle(qid: string, language: string): Promise<string | null> {
    const site = `${language}wiki`;
    const params = new URLSearchParams({
      action: 'wbgetentities',
      ids: qid,
      props: 'sitelinks',
      sitefilter: site,
      format: 'json',
    });
    const res = await fetchWithTimeout(`${WIKIDATA_API}?${params.toString()}`, {});
    if (!res.ok) return null;
    const data = (await res.json()) as {
      entities?: Record<string, { sitelinks?: Record<string, { title?: string }> }>;
    };
    return data.entities?.[qid]?.sitelinks?.[site]?.title ?? null;
  }
}

/** Parses Wikidata WKT Point("Point(lng lat)") into a JS `{lat,lng}` pair. */
function parseWktPoint(value: string | undefined): { lat: number; lng: number } | null {
  if (!value) return null;
  const m = /^Point\(([-0-9.]+) ([-0-9.]+)\)$/.exec(value);
  if (!m) return null;
  const lng = Number(m[1]);
  const lat = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
