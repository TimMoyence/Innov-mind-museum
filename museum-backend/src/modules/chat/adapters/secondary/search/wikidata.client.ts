import { ValidationError } from '@shared/errors/app.error';
import { assertEntityId, assertLang } from '@shared/http/wikidata-ids';
import { logger } from '@shared/logger/logger';

import type {
  ArtworkFacts,
  KnowledgeBaseProvider,
  KnowledgeBaseQuery,
} from '@modules/chat/domain/ports/knowledge-base.port';

const USER_AGENT = 'Musaium/1.0 (https://musaium.app; contact@musaium.app)';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';

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

/** Wikidata adapter implementing {@link KnowledgeBaseProvider}. Never throws from public methods. */
export class WikidataClient implements KnowledgeBaseProvider {
  /**
   * Looks up artwork facts from Wikidata by search term.
   *
   * Searches for entities matching the term, filters for art-related results,
   * then fetches structured properties via SPARQL. Returns `null` on any failure
   * (network error, rate limit, no results, etc.) — never throws.
   *
   * @param query - Search term and optional language code.
   * @returns Artwork facts if found, or `null`.
   */
  async lookup(query: KnowledgeBaseQuery): Promise<ArtworkFacts | null> {
    try {
      const rawLang = query.language ?? 'en';
      const lang = isValidLanguageCode(rawLang) ? rawLang.toLowerCase() : 'en';
      const entity = await this.searchEntity(query.searchTerm, lang);
      if (!entity) return null;
      return await this.fetchProperties(entity.id, entity.label, lang);
    } catch (err) {
      logger.warn('wikidata_lookup_error', {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
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

    const res = await fetch(`${WIKIDATA_API}?${params.toString()}`, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!res.ok) return null;

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

    const sparql = `
      SELECT ?creatorLabel ?inception ?materialLabel ?collectionLabel ?movementLabel ?genreLabel ?image
      WHERE {
        BIND(wd:${qid} AS ?item)
        OPTIONAL { ?item wdt:P170 ?creator. }
        OPTIONAL { ?item wdt:P571 ?inception. }
        OPTIONAL { ?item wdt:P186 ?material. }
        OPTIONAL { ?item wdt:P195 ?collection. }
        OPTIONAL { ?item wdt:P135 ?movement. }
        OPTIONAL { ?item wdt:P136 ?genre. }
        OPTIONAL { ?item wdt:P18 ?image. }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "${language},en". }
      }
      LIMIT 1`;

    const res = await fetch(`${WIKIDATA_SPARQL}?query=${encodeURIComponent(sparql)}&format=json`, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/sparql-results+json',
      },
    });

    if (!res.ok) return null;

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
    };
  }
}
