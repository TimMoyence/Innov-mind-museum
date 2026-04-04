import type { ImageEnrichmentService } from './image-enrichment.service';
import type { KnowledgeBaseService } from './knowledge-base.service';
import type { UserMemoryService } from './user-memory.service';
import type { EnrichedImage } from '../domain/chat.types';
import type { ArtworkFacts } from '../domain/ports/knowledge-base.port';

/** Dependencies needed by fetchEnrichmentData (subset of ChatMessageServiceDeps). */
export interface EnrichmentDeps {
  userMemory?: UserMemoryService;
  knowledgeBase?: KnowledgeBaseService;
  imageEnrichment?: ImageEnrichmentService;
}

/**
 * Extracts a search term for knowledge base lookup from conversation history or input text.
 * Searches for the last assistant message with a detected artwork title, falling back to input text if 3+ words.
 */
export function extractSearchTerm(
  history: { role: string; metadata?: Record<string, unknown> | null }[],
  inputText?: string,
): string | null {
  // Search history for last assistant message with detectedArtwork.title
  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === 'assistant' && msg.metadata) {
      const meta = msg.metadata as { detectedArtwork?: { title?: string } };
      if (meta.detectedArtwork?.title) {
        return meta.detectedArtwork.title;
      }
    }
  }
  // Fallback: use input text if it has 3+ words
  if (inputText && inputText.split(/\s+/).length >= 3) {
    return inputText;
  }
  return null;
}

/** Fetches user memory, knowledge-base text, KB facts, and image enrichment in parallel (fail-open). */
export async function fetchEnrichmentData(
  deps: EnrichmentDeps,
  history: { role: string; metadata?: Record<string, unknown> | null }[],
  inputText: string | undefined,
  ownerId: number | undefined,
): Promise<{
  userMemoryBlock: string;
  knowledgeBaseBlock: string;
  enrichedImages: EnrichedImage[];
}> {
  let userMemoryBlock = '';
  let knowledgeBaseBlock = '';
  let enrichedImages: EnrichedImage[] = [];

  const searchTerm = extractSearchTerm(history, inputText);
  let kbFacts: ArtworkFacts | null = null;

  await Promise.all([
    deps.userMemory && ownerId
      ? deps.userMemory
          .getMemoryForPrompt(ownerId)
          .then((b: string) => {
            userMemoryBlock = b;
          })
          .catch(() => {
            /* fail-open */
          })
      : Promise.resolve(),
    deps.knowledgeBase && searchTerm
      ? deps.knowledgeBase
          .lookup(searchTerm)
          .then((b: string) => {
            knowledgeBaseBlock = b;
          })
          .catch(() => {
            /* fail-open */
          })
      : Promise.resolve(),
    deps.knowledgeBase && deps.imageEnrichment && searchTerm
      ? deps.knowledgeBase
          .lookupFacts(searchTerm)
          .then((facts) => {
            kbFacts = facts;
          })
          .catch(() => {
            /* fail-open */
          })
      : Promise.resolve(),
    deps.imageEnrichment && searchTerm
      ? deps.imageEnrichment
          .enrich(searchTerm)
          .then((imgs) => {
            enrichedImages = imgs;
          })
          .catch(() => {
            /* fail-open */
          })
      : Promise.resolve(),
  ]);

  // Merge Wikidata image into enriched images if KB returned a P18 imageUrl
  const resolvedFacts = kbFacts as ArtworkFacts | null;
  if (resolvedFacts?.imageUrl && deps.imageEnrichment && searchTerm) {
    enrichedImages = deps.imageEnrichment.mergeWikidataImage(
      enrichedImages,
      resolvedFacts.imageUrl,
      searchTerm,
    );
  }

  return { userMemoryBlock, knowledgeBaseBlock, enrichedImages };
}
