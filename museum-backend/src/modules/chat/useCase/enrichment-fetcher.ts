import type { ImageEnrichmentService } from './image-enrichment.service';
import type { KnowledgeBaseService } from './knowledge-base.service';
import type { UserMemoryService } from './user-memory.service';
import type { WebSearchService } from './web-search.service';
import type { EnrichedImage } from '../domain/chat.types';
import type { ArtworkFacts } from '../domain/ports/knowledge-base.port';

/** Dependencies needed by fetchEnrichmentData (subset of ChatMessageServiceDeps). */
interface EnrichmentDeps {
  userMemory?: UserMemoryService;
  knowledgeBase?: KnowledgeBaseService;
  imageEnrichment?: ImageEnrichmentService;
  webSearch?: WebSearchService;
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

/** Wraps a promise so any error is swallowed (fail-open). Returns `undefined` on error. */
function failOpen<T>(p: Promise<T>): Promise<T | undefined> {
  return p.catch(() => {
    return;
  });
}

/** Fetches user memory block (or empty) — fail-open. */
function fetchMemory(
  deps: EnrichmentDeps,
  ownerId: number | undefined,
): Promise<string | undefined> {
  if (!deps.userMemory || !ownerId) return Promise.resolve();
  return failOpen(deps.userMemory.getMemoryForPrompt(ownerId));
}

/** Fetches knowledge-base prompt block (or empty) — fail-open. */
function fetchKnowledgeBase(
  deps: EnrichmentDeps,
  searchTerm: string | null,
): Promise<string | undefined> {
  if (!deps.knowledgeBase || !searchTerm) return Promise.resolve();
  return failOpen(deps.knowledgeBase.lookup(searchTerm));
}

/** Fetches raw KB facts for image merging — fail-open. */
function fetchKbFacts(
  deps: EnrichmentDeps,
  searchTerm: string | null,
): Promise<ArtworkFacts | null | undefined> {
  if (!deps.knowledgeBase || !deps.imageEnrichment || !searchTerm) {
    return Promise.resolve();
  }
  return failOpen(deps.knowledgeBase.lookupFacts(searchTerm));
}

/** Fetches image enrichment results — fail-open. */
function fetchImages(
  deps: EnrichmentDeps,
  searchTerm: string | null,
): Promise<EnrichedImage[] | undefined> {
  if (!deps.imageEnrichment || !searchTerm) return Promise.resolve();
  return failOpen(deps.imageEnrichment.enrich(searchTerm));
}

/** Fetches web search prompt block (or empty) — fail-open. */
function fetchWebSearch(
  deps: EnrichmentDeps,
  searchTerm: string | null,
): Promise<string | undefined> {
  if (!deps.webSearch || !searchTerm) return Promise.resolve();
  return failOpen(deps.webSearch.search(searchTerm));
}

/** Fetches user memory, knowledge-base text, KB facts, web search, and image enrichment in parallel (fail-open). */
export async function fetchEnrichmentData(
  deps: EnrichmentDeps,
  history: { role: string; metadata?: Record<string, unknown> | null }[],
  inputText: string | undefined,
  ownerId: number | undefined,
): Promise<{
  userMemoryBlock: string;
  knowledgeBaseBlock: string;
  webSearchBlock: string;
  enrichedImages: EnrichedImage[];
}> {
  const searchTerm = extractSearchTerm(history, inputText);

  const [memory, kb, kbFacts, images, web] = await Promise.all([
    fetchMemory(deps, ownerId),
    fetchKnowledgeBase(deps, searchTerm),
    fetchKbFacts(deps, searchTerm),
    fetchImages(deps, searchTerm),
    fetchWebSearch(deps, searchTerm),
  ]);

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
    webSearchBlock: web ?? '',
    enrichedImages,
  };
}
