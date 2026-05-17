import type { EnrichedImage, SuggestedImage } from '@modules/chat/domain/chat.types';
import type { ArtworkFacts } from '@modules/chat/domain/ports/knowledge-base.port';
import type { SearchResult } from '@modules/chat/domain/ports/web-search.port';
import type {
  ImageEnrichmentService,
  SuggestedImageAnnotation,
} from '@modules/chat/useCase/image/image-enrichment.service';
import type { KnowledgeBaseService } from '@modules/chat/useCase/knowledge/knowledge-base.service';
import type { UserMemoryService } from '@modules/chat/useCase/memory/user-memory.service';
import type { WebSearchService } from '@modules/chat/useCase/web-search/web-search.service';
import type { DbLookupService } from '@modules/knowledge-extraction/useCase/lookup/db-lookup.service';

interface EnrichmentDeps {
  userMemory?: UserMemoryService;
  knowledgeBase?: KnowledgeBaseService;
  imageEnrichment?: ImageEnrichmentService;
  webSearch?: WebSearchService;
  dbLookup?: DbLookupService;
}

/**
 * Last assistant message with detectedArtwork.title, else input text if ≥3 words.
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

/** R1+R15 — capped at 4 entries (defence-in-depth on top of LLM prompt cap). */
export function extractSuggestedImageEntries(
  history: { role: string; metadata?: Record<string, unknown> | null }[],
): SuggestedImage[] | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role !== 'assistant' || !msg.metadata) continue;
    const meta = msg.metadata as { suggestedImages?: unknown };
    if (!Array.isArray(meta.suggestedImages) || meta.suggestedImages.length === 0) continue;
    const entries = meta.suggestedImages
      .filter((entry): entry is SuggestedImage => isV2SuggestedImage(entry))
      .slice(0, 4);
    if (entries.length > 0) return entries;
  }
  return null;
}

function isV2SuggestedImage(entry: unknown): entry is SuggestedImage {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as Record<string, unknown>;
  return (
    typeof e.query === 'string' &&
    typeof e.description === 'string' &&
    typeof e.rationale === 'string' &&
    typeof e.caption === 'string'
  );
}

/** Fail-open: error → undefined. */
function failOpen<T>(p: Promise<T>): Promise<T | undefined> {
  return p.catch<undefined>(() => Promise.resolve() as Promise<undefined>);
}

const NONE: Promise<undefined> = Promise.resolve() as Promise<undefined>;

function fetchMemory(
  deps: EnrichmentDeps,
  ownerId: number | undefined,
): Promise<string | undefined> {
  if (!deps.userMemory || !ownerId) return NONE;
  return failOpen(deps.userMemory.getMemoryForPrompt(ownerId));
}

function fetchKnowledgeBase(
  deps: EnrichmentDeps,
  searchTerm: string | null,
): Promise<string | undefined> {
  if (!deps.knowledgeBase || !searchTerm) return NONE;
  return failOpen(deps.knowledgeBase.lookup(searchTerm));
}

function fetchKbFacts(
  deps: EnrichmentDeps,
  searchTerm: string | null,
): Promise<ArtworkFacts | null | undefined> {
  if (!deps.knowledgeBase || !deps.imageEnrichment || !searchTerm) {
    return NONE;
  }
  return failOpen(deps.knowledgeBase.lookupFacts(searchTerm));
}

/** Fan-out per suggested entry when present, else legacy single-term (R2). */
interface FetchImagesArgs {
  searchTerm: string | null;
  suggestedEntries: SuggestedImage[] | null;
  museumMode: boolean;
  requestId: string | undefined;
}

function fetchImages(
  deps: EnrichmentDeps,
  args: FetchImagesArgs,
): Promise<EnrichedImage[] | undefined> {
  const { searchTerm, suggestedEntries, museumMode, requestId } = args;
  if (!deps.imageEnrichment) return NONE;
  if (suggestedEntries && suggestedEntries.length > 0) {
    const queries = suggestedEntries.map((s) => s.query.trim()).filter(Boolean);
    if (queries.length === 0) return NONE;
    const annotations: SuggestedImageAnnotation[] = suggestedEntries.map((s) => ({
      query: s.query,
      caption: s.caption,
      rationale: s.rationale,
    }));
    return failOpen(
      deps.imageEnrichment.enrich(queries, undefined, annotations, museumMode, requestId),
    );
  }
  if (!searchTerm) return NONE;
  return failOpen(
    deps.imageEnrichment.enrich(searchTerm, undefined, undefined, museumMode, requestId),
  );
}

function fetchWebSearchRaw(
  deps: EnrichmentDeps,
  searchTerm: string | null,
): Promise<SearchResult[] | undefined> {
  if (!deps.webSearch || !searchTerm) return NONE;
  return failOpen(deps.webSearch.searchRaw(searchTerm));
}

function fetchLocalKnowledge(
  deps: EnrichmentDeps,
  searchTerm: string | null,
  locale: string,
): Promise<string | undefined> {
  if (!deps.dbLookup || !searchTerm) return NONE;
  return failOpen(deps.dbLookup.lookup(searchTerm, locale));
}

export interface FetchEnrichmentArgs {
  deps: EnrichmentDeps;
  history: { role: string; metadata?: Record<string, unknown> | null }[];
  inputText: string | undefined;
  ownerId: number | undefined;
  locale?: string;
  museumMode?: boolean;
  requestId?: string;
}

/** Parallel fan-out: memory, KB, local knowledge, web search, images. All fail-open. */
export async function fetchEnrichmentData(args: FetchEnrichmentArgs): Promise<{
  userMemoryBlock: string;
  knowledgeBaseBlock: string;
  localKnowledgeBlock: string;
  webSearchBlock: string;
  webSearchResults: SearchResult[];
  enrichedImages: EnrichedImage[];
}> {
  const { deps, history, inputText, ownerId, locale, museumMode, requestId } = args;
  const searchTerm = extractSearchTerm(history, inputText);
  const suggestedEntries = extractSuggestedImageEntries(history);
  const resolvedLocale = locale ?? 'en';

  const [memory, kb, kbFacts, images, webResults, localKb] = await Promise.all([
    fetchMemory(deps, ownerId),
    fetchKnowledgeBase(deps, searchTerm),
    fetchKbFacts(deps, searchTerm),
    fetchImages(deps, {
      searchTerm,
      suggestedEntries,
      museumMode: museumMode === true,
      requestId,
    }),
    fetchWebSearchRaw(deps, searchTerm),
    fetchLocalKnowledge(deps, searchTerm, resolvedLocale),
  ]);

  const safeWebResults = webResults ?? [];

  // Build web search prompt block from raw results
  let webSearchBlock = '';
  if (safeWebResults.length > 0 && deps.webSearch) {
    const { buildWebSearchPromptBlock } =
      await import('@modules/chat/useCase/web-search/web-search.prompt');
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
