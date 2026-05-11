import { ValidationError } from '@shared/errors/app.error';
import { assertEntityId, assertLang } from '@shared/http/wikidata-ids';
import { logger } from '@shared/logger/logger';

import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
  KnowledgeBaseQuery,
} from '@modules/chat/domain/ports/knowledge-base.port';

const DEFAULT_USER_AGENT = 'Musaium/1.0 (https://musaium.app; contact@musaium.app)';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';

/**
 * Transient error wrapping a network or server-side Wikidata failure
 * (fetch reject, 408, 429, 5xx). Distinct from legitimate "no match" /
 * malformed-entity / 4xx-non-retryable cases which still resolve to `null`.
 *
 * The C5 circuit breaker (`WikidataBreakerClient`) counts these as failures
 * for opening; the public `WikidataClient.lookup()` catches them to preserve
 * its fail-open contract.
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
 * Validates a Wikidata language code (2-3 lowercase letters, optional region).
 * Loose prefilter — kept for early rejection before throw-on-fail assertions
 * downstream. Defense-in-depth: {@link assertLang} is the actual trust boundary.
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

/** Wikidata adapter implementing {@link KnowledgeBaseProvider}. The public `lookup()` never throws. */
export class WikidataClient implements KnowledgeBaseProvider {
  private readonly userAgent: string;

  constructor(options: { userAgent?: string } = {}) {
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  }
  /**
   * Looks up artwork facts and swallows all errors — preserves the
   * fail-open contract relied on by direct callers and existing tests.
   * The C5 breaker should call {@link lookupOrThrow} instead.
   */
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
   * Looks up artwork facts, propagating {@link WikidataTransientError} on
   * network / 408 / 429 / 5xx so that a circuit breaker can count failures.
   * Legitimate empties (no match, invalid QID, non-art descriptions, 4xx-non-retryable)
   * still resolve to `null` without throwing.
   */
  async lookupOrThrow(query: KnowledgeBaseQuery): Promise<ArtworkFacts | null> {
    const rawLang = query.language ?? 'en';
    const lang = isValidLanguageCode(rawLang) ? rawLang.toLowerCase() : 'en';
    const entity = await this.searchEntity(query.searchTerm, lang);
    if (!entity) return null;
    return await this.fetchProperties(entity.id, entity.label, lang);
  }

  /**
   * Searches Wikidata for an entity matching the given term.
   *
   * Returns the first result whose description contains an art-related keyword,
   * or `null` if no matching entity is found.
   *
   * @param term - Free-text search term (e.g., "Mona Lisa").
   * @param language - Wikidata language code (e.g., "en", "fr").
   * @returns Entity ID and label, or `null`.
   */
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
        headers: { 'User-Agent': this.userAgent },
      });
    } catch (err) {
      // Network failure (fetch reject) — transient, breaker should count it
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

    // Find first result whose description matches an art keyword
    const match = data.search.find(
      (item) =>
        item.description != null &&
        ART_KEYWORDS.some((kw) => item.description?.toLowerCase().includes(kw) === true),
    );

    return match ? { id: match.id, label: match.label } : null;
  }

  /**
   * Fetches structured artwork properties from Wikidata via SPARQL.
   *
   * Queries creator, inception date, material, collection, movement, and genre
   * for the given entity. Validates the QID format before interpolation.
   *
   * @param qid - Wikidata entity ID (e.g., "Q12418").
   * @param label - Display label for the artwork title.
   * @param language - Language code for localized labels.
   * @returns Parsed artwork facts, or `null` if QID is invalid or query fails.
   */
  private async fetchProperties(
    qid: string,
    label: string,
    language: string,
  ): Promise<ArtworkFacts | null> {
    // Defense-in-depth: strict assert before SPARQL interpolation. Throws
    // ValidationError on tampered ids — caught by the public `lookup()` wrapper
    // (fail-open). Protects direct callers + any future consumer.
    try {
      assertEntityId(qid);
      assertLang(language);
    } catch (err) {
      if (err instanceof ValidationError) return null;
      throw err;
    }

    // C2 v2 (2026-05) — adds `aliases` projection via skos:altLabel +
    // schema:alternateName, GROUP_CONCAT-joined on `|`. Empty / missing when
    // the entity has no aliases in the requested language. No extra round-trip.
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
          'User-Agent': this.userAgent,
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
    // Use UTC year to avoid timezone drift (e.g., "1503-01-01T00:00:00Z" becomes
    // 1502 when interpreted in Europe/Paris pre-1891 local mean time).
    const date = inception ? `c. ${new Date(inception).getUTCFullYear().toString()}` : undefined;

    // C2 v2 — split GROUP_CONCAT on `|`, drop empty fragments, dedup.
    const aliasesRaw = val('aliases');
    const aliases = aliasesRaw
      ? Array.from(new Set(aliasesRaw.split('|').map((s) => s.trim()).filter(Boolean)))
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
