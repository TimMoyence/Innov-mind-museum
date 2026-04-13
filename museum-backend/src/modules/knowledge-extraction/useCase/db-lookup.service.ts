import { logger } from '@shared/logger/logger';

import { buildLocalKnowledgeBlock } from './db-lookup.prompt';

import type { ArtworkKnowledgeRepoPort } from '../domain/ports/artwork-knowledge-repo.port';
import type { MuseumEnrichmentRepoPort } from '../domain/ports/museum-enrichment-repo.port';

/**
 * Queries the local knowledge DB for artwork/museum data and returns a formatted prompt block.
 * Used as a 6th enrichment source in the chat pipeline. Fail-open: always returns a string.
 */
export class DbLookupService {
  constructor(
    private readonly artworkRepo: ArtworkKnowledgeRepoPort,
    private readonly museumRepo: MuseumEnrichmentRepoPort,
  ) {}

  /**
   * Looks up local knowledge by search term and returns a formatted `[LOCAL KNOWLEDGE]` prompt
   * block, or empty string when nothing is found or an error occurs.
   */
  async lookup(searchTerm: string, locale: string): Promise<string> {
    if (!searchTerm.trim()) return '';
    try {
      const [artworks, museums] = await Promise.all([
        this.artworkRepo.searchByTitle(searchTerm, locale),
        this.museumRepo.searchByName(searchTerm, locale),
      ]);
      const block = buildLocalKnowledgeBlock(artworks, museums);
      if (block) {
        logger.info('db_lookup_hit', {
          searchTerm,
          artworks: artworks.length,
          museums: museums.length,
        });
      }
      return block;
    } catch (err) {
      logger.warn('db_lookup_error', {
        searchTerm,
        error: err instanceof Error ? err.message : String(err),
      });
      return '';
    }
  }
}
