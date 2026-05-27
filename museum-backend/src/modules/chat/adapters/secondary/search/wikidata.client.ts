import { ValidationError } from '@shared/errors/app.error';
import { assertEntityId, assertLang } from '@shared/http/wikidata-ids';
import { logger } from '@shared/logger/logger';

import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
  KnowledgeBaseQuery,
} from '@modules/chat/domain/ports/knowledge-base.port';

const DEFAULT_USER_AGENT = 'Musaium/1.0 (https://musaium.com; contact@musaium.com)';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';

/**
 * Network / 408 / 429 / 5xx. Distinct from "no match" / malformed-entity /
 * 4xx-non-retryable which resolve to `null`. C5 breaker counts these as failures;
 * public `lookup()` catches them for fail-open.
 */
export class WikidataTransientError extends Error {
  constructor(
    public readonly cause: unknown,
    public readonly stage: 'search' | 'sparql',
  ) {
    super(`wikidata_transient_${stage}`);
    this.name = 'WikidataTransientError';
  }
}

const isTransientStatus = (status: number): boolean =>
  status === 408 || status === 429 || (status >= 500 && status < 600);

/**
 * Loose prefilter for early rejection. `assertLang` downstream is the actual trust boundary.
 */
function isValidLanguageCode(lang: string): boolean {
  return /^[a-z]{2,3}$/i.test(lang) || /^[a-z]{2,3}-[a-z]{2,4}$/i.test(lang);
}

const ART_KEYWORDS = [
  'painting',
  'sculpture',
  'artwork',
  'fresco',
  'drawing',
  'mural',
  'installation',
  'photograph',
  'tapestry',
  'mosaic',
  'engraving',
  'print',
  'lithograph',
  'watercolor',
  'oil painting',
  'portrait',
  'landscape',
  'altarpiece',
  'relief',
  'peinture',
  'sculpture',
  'tableau',
  'oeuvre',
];

/** Public `lookup()` never throws. */
export class WikidataClient implements KnowledgeBaseProvider {
  // ES2022 private field — kept off instance own-property surface so SSRF matrix
  // (`tests/integration/security/ssrf-matrix.integration.test.ts`) keeps asserting
  // `Object.keys(new WikidataClient()) === []`. User-Agent is header-only, no SSRF surface.
  readonly #userAgent: string;

  constructor(options: { userAgent?: string } = {}) {
    this.#userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  }
  /** Swallows all errors — fail-open contract. C5 breaker should call {@link lookupOrThrow}. */
  async lookup(query: KnowledgeBaseQuery): Promise<ArtworkFacts | null> {
    try {
      return await this.lookupOrThrow(query);
    } catch (err) {
      logger.warn('wikidata_lookup_error', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Propagates `WikidataTransientError` on network/408/429/5xx so breaker counts failures.
   * Legitimate empties (no match, invalid QID, non-art, 4xx-non-retryable) resolve to `null`.
   */
  async lookupOrThrow(query: KnowledgeBaseQuery): Promise<ArtworkFacts | null> {
    const rawLang = query.language ?? 'en';
    const lang = isValidLanguageCode(rawLang) ? rawLang.toLowerCase() : 'en';
    const entity = await this.searchEntity(query.searchTerm, lang);
    if (!entity) return null;
    return await this.fetchProperties(entity.id, entity.label, lang);
  }

  /** Returns first result whose description contains an art keyword, or null. */
  private async searchEntity(
    term: string,
    language: string,
  ): Promise<{ id: string; label: string } | null> {
    const params = new URLSearchParams({
      action: 'wbsearchentities',
      search: term,
      language,
      type: 'item',
      limit: '5',
      format: 'json',
    });

    let res: Response;
    try {
      res = await fetch(`${WIKIDATA_API}?${params.toString()}`, {
        headers: { 'User-Agent': this.#userAgent },
      });
    } catch (err) {
      throw new WikidataTransientError(err, 'search');
    }

    if (!res.ok) {
      if (isTransientStatus(res.status)) {
        throw new WikidataTransientError({ status: res.status }, 'search');
      }
      return null;
    }

    const data = (await res.json()) as {
      search: { id: string; label: string; description?: string }[];
    };

    const match = data.search.find(
      (item) =>
        item.description != null &&
        ART_KEYWORDS.some((kw) => item.description?.toLowerCase().includes(kw) === true),
    );

    return match ? { id: match.id, label: match.label } : null;
  }

  // eslint-disable-next-line max-lines-per-function -- SPARQL query body + Wikidata response parsing inline; splitting would fragment a single read-path
  private async fetchProperties(
    qid: string,
    label: string,
    language: string,
  ): Promise<ArtworkFacts | null> {
    // Defense-in-depth: strict assert before SPARQL interpolation. Throws on
    // tampered ids — caught by `lookup()` wrapper (fail-open).
    try {
      assertEntityId(qid);
      assertLang(language);
    } catch (err) {
      if (err instanceof ValidationError) return null;
      throw err;
    }

    // C2 v2 (2026-05) — `aliases` projection via skos:altLabel + schema:alternateName,
    // GROUP_CONCAT on `|`. No extra round-trip.
    const sparql = `
      SELECT
        ?creatorLabel ?inception ?materialLabel ?collectionLabel ?movementLabel ?genreLabel ?image
        (GROUP_CONCAT(DISTINCT ?aliasLabel; SEPARATOR='|') AS ?aliases)
      WHERE {
        BIND(wd:${qid} AS ?item)
        OPTIONAL { ?item wdt:P170 ?creator. }
        OPTIONAL { ?item wdt:P571 ?inception. }
        OPTIONAL { ?item wdt:P186 ?material. }
        OPTIONAL { ?item wdt:P195 ?collection. }
        OPTIONAL { ?item wdt:P135 ?movement. }
        OPTIONAL { ?item wdt:P136 ?genre. }
        OPTIONAL { ?item wdt:P18 ?image. }
        OPTIONAL { ?item skos:altLabel ?skosAlias FILTER(LANG(?skosAlias) = "${language}") }
        OPTIONAL { ?item schema:alternateName ?schemaAlias FILTER(LANG(?schemaAlias) = "${language}") }
        BIND(COALESCE(?skosAlias, ?schemaAlias) AS ?aliasLabel)
        SERVICE wikibase:label { bd:serviceParam wikibase:language "${language},en". }
      }
      GROUP BY ?creatorLabel ?inception ?materialLabel ?collectionLabel ?movementLabel ?genreLabel ?image
      LIMIT 1`;

    let res: Response;
    try {
      res = await fetch(`${WIKIDATA_SPARQL}?query=${encodeURIComponent(sparql)}&format=json`, {
        headers: {
          'User-Agent': this.#userAgent,
          Accept: 'application/sparql-results+json',
        },
      });
    } catch (err) {
      throw new WikidataTransientError(err, 'sparql');
    }

    if (!res.ok) {
      if (isTransientStatus(res.status)) {
        throw new WikidataTransientError({ status: res.status }, 'sparql');
      }
      return null;
    }

    const data = (await res.json()) as {
      results: { bindings: Record<string, { value: string }>[] };
    };
    const bindings = data.results.bindings[0] as Record<string, { value: string }> | undefined;
    if (!bindings) return null;

    const val = (key: string): string | undefined =>
      (bindings[key] as { value: string } | undefined)?.value;
    const inception = val('inception');
    // UTC year avoids timezone drift (e.g., "1503-01-01T00:00:00Z" becomes 1502
    // when interpreted in Europe/Paris pre-1891 local mean time).
    const date = inception ? `c. ${new Date(inception).getUTCFullYear().toString()}` : undefined;

    const aliasesRaw = val('aliases');
    const aliases = aliasesRaw
      ? Array.from(
          new Set(
            aliasesRaw
              .split('|')
              .map((s) => s.trim())
              .filter(Boolean),
          ),
        )
      : undefined;

    return {
      qid,
      title: label,
      artist: val('creatorLabel'),
      date,
      technique: val('materialLabel'),
      collection: val('collectionLabel'),
      movement: val('movementLabel'),
      genre: val('genreLabel'),
      imageUrl: val('image') ?? undefined,
      aliases: aliases && aliases.length > 0 ? aliases : undefined,
    };
  }
}
