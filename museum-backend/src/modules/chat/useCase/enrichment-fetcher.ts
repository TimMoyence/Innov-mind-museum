import type { ImageEnrichmentService } from './image-enrichment.service';
import type { KnowledgeBaseService } from './knowledge-base.service';
import type { UserMemoryService } from './user-memory.service';
import type { WebSearchService } from './web-search.service';
import type { EnrichedImage } from '../domain/chat.types';
import type { ArtworkFacts } from '../domain/ports/knowledge-base.port';
import type { SearchResult } from '../domain/ports/web-search.port';
import type { DbLookupService } from '@modules/knowledge-extraction/useCase/db-lookup.service';

/** Dependencies needed by fetchEnrichmentData (subset of ChatMessageServiceDeps). */
interface EnrichmentDeps {
  userMemory?: UserMemoryService;
  knowledgeBase?: KnowledgeBaseService;
  imageEnrichment?: ImageEnrichmentService;
  webSearch?: WebSearchService;
  dbLookup?: DbLookupService;
}

/**
 * Extracts a search term for knowledge base lookup from conversation history or input text.
 * Searches for the last assistant message with a detected artwork title, falling back to input text if 3+ words.
 */
export function extractSearchTerm(
  history: { role: string; metadata?: Record<string, unknown> | null }[],
  inputText?: string,
): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === 'assistant' && msg.metadata) {
      const meta = msg.metadata as { detectedArtwork?: { title?: string } };
      if (meta.detectedArtwork?.title) {
        return meta.detectedArtwork.title;
      }
    }
  }
  if (inputText && inputText.split(/\s+/).length >= 3) {
    return inputText;
  }
  return null;
}

/** Wraps a promise so any error is swallowed (fail-open). Resolves to `undefined` on error. */
function failOpen<T>(p: Promise<T>): Promise<T | undefined> {
  return p.catch<undefined>(() => Promise.resolve() as Promise<undefined>);
}

const NONE: Promise<undefined> = Promise.resolve() as Promise<undefined>;

/** Fetches user memory block (or empty) — fail-open. */
function fetchMemory(
  deps: EnrichmentDeps,
  ownerId: number | undefined,
): Promise<string | undefined> {
  if (!deps.userMemory || !ownerId) return NONE;
  return failOpen(deps.userMemory.getMemoryForPrompt(ownerId));
}

/** Fetches knowledge-base prompt block (or empty) — fail-open. */
function fetchKnowledgeBase(
  deps: EnrichmentDeps,
  searchTerm: string | null,
): Promise<string | undefined> {
  if (!deps.knowledgeBase || !searchTerm) return NONE;
  return failOpen(deps.knowledgeBase.lookup(searchTerm));
}

/** Fetches raw KB facts for image merging — fail-open. */
function fetchKbFacts(
  deps: EnrichmentDeps,
  searchTerm: string | null,
): Promise<ArtworkFacts | null | undefined> {
  if (!deps.knowledgeBase || !deps.imageEnrichment || !searchTerm) {
    return NONE;
  }
  return failOpen(deps.knowledgeBase.lookupFacts(searchTerm));
}

/** Fetches image enrichment results — fail-open. */
function fetchImages(
  deps: EnrichmentDeps,
  searchTerm: string | null,
): Promise<EnrichedImage[] | undefined> {
  if (!deps.imageEnrichment || !searchTerm) return NONE;
  return failOpen(deps.imageEnrichment.enrich(searchTerm));
}

/** Fetches raw web search results for prompt building and URL enqueuing — fail-open. */
function fetchWebSearchRaw(
  deps: EnrichmentDeps,
  searchTerm: string | null,
): Promise<SearchResult[] | undefined> {
  if (!deps.webSearch || !searchTerm) return NONE;
  return failOpen(deps.webSearch.searchRaw(searchTerm));
}

/** Fetches local knowledge block from the extraction DB — fail-open. */
function fetchLocalKnowledge(
  deps: EnrichmentDeps,
  searchTerm: string | null,
  locale: string,
): Promise<string | undefined> {
  if (!deps.dbLookup || !searchTerm) return NONE;
  return failOpen(deps.dbLookup.lookup(searchTerm, locale));
}

/** Fetches all enrichment sources in parallel (fail-open): memory, KB, local knowledge, web search, images. */
export async function fetchEnrichmentData(
  deps: EnrichmentDeps,
  history: { role: string; metadata?: Record<string, unknown> | null }[],
  inputText: string | undefined,
  ownerId: number | undefined,
  locale?: string,
): Promise<{
  userMemoryBlock: string;
  knowledgeBaseBlock: string;
  localKnowledgeBlock: string;
  webSearchBlock: string;
  webSearchResults: SearchResult[];
  enrichedImages: EnrichedImage[];
}> {
  const searchTerm = extractSearchTerm(history, inputText);
  const resolvedLocale = locale ?? 'en';

  const [memory, kb, kbFacts, images, webResults, localKb] = await Promise.all([
    fetchMemory(deps, ownerId),
    fetchKnowledgeBase(deps, searchTerm),
    fetchKbFacts(deps, searchTerm),
    fetchImages(deps, searchTerm),
    fetchWebSearchRaw(deps, searchTerm),
    fetchLocalKnowledge(deps, searchTerm, resolvedLocale),
  ]);

  const safeWebResults = webResults ?? [];

  // Build web search prompt block from raw results
  let webSearchBlock = '';
  if (safeWebResults.length > 0 && deps.webSearch) {
    // Re-use the prompt builder that WebSearchService.search() uses internally
    const { buildWebSearchPromptBlock } = await import('./web-search.prompt');
    webSearchBlock = buildWebSearchPromptBlock(safeWebResults);
  }

  let enrichedImages = images ?? [];
  if (kbFacts?.imageUrl && deps.imageEnrichment && searchTerm) {
    enrichedImages = deps.imageEnrichment.mergeWikidataImage(
      enrichedImages,
      kbFacts.imageUrl,
      searchTerm,
    );
  }

  return {
    userMemoryBlock: memory ?? '',
    knowledgeBaseBlock: kb ?? '',
    localKnowledgeBlock: localKb ?? '',
    webSearchBlock,
    webSearchResults: safeWebResults,
    enrichedImages,
  };
}
