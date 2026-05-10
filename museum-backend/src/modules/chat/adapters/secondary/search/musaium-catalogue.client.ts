import { normalizeForScoring } from '@modules/chat/useCase/image/image-scoring';
import { artworks } from '@modules/daily-art/adapters/secondary/catalog/artworks.data';

import type {
  ImageSourceClient,
  ImageSourcePhoto,
} from '@modules/chat/domain/ports/image-source.port';
import type { Artwork } from '@modules/daily-art/domain/artwork/artwork.types';

/**
 * Internal Musaium curated catalogue client (C2 v2 — 2026-05).
 *
 * Implements the existing `ImageSourceClient` port. Reads the static
 * `artworks.data.ts` catalogue from the daily-art aggregate (Decision D2 in
 * design.md) — no DB query, no network call. Returns at most 1 result on an
 * exact normalised title match (Q4 RESOLVED — exact normalised, no fuzzy).
 *
 * Normalisation reuses `normalizeForScoring` (lowercase + NFD + strip
 * diacritics) so a query like "mona lísa" matches "Mona Lisa".
 */
export class MusaiumCatalogueClient implements ImageSourceClient {
  // Pre-compute the normalised title index once at construction. The catalogue
  // is a `readonly Artwork[]` — frozen at module load — so this is safe.
  private readonly indexByTitle: Map<string, Artwork>;

  constructor(catalogue: readonly Artwork[] = artworks) {
    const index = new Map<string, Artwork>();
    for (const artwork of catalogue) {
      index.set(normalizeForScoring(artwork.title), artwork);
    }
    this.indexByTitle = index;
  }

  /**
   * Looks up the curated catalogue for a title that exactly matches the
   * normalised query. Returns at most 1 result. Synchronous in spirit
   * (in-memory map lookup) — fulfils the `Promise<>` contract via direct
   * resolve with no microtask hop beyond `async`.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- Justification: ImageSourceClient is async-typed; the actual lookup is sync (in-memory Map). Approved-by: tim@2026-05-10
  async searchPhotos(query: string, _perPage?: number): Promise<ImageSourcePhoto[]> {
    const normalisedQuery = normalizeForScoring(query);
    if (!normalisedQuery) return [];

    const match = this.indexByTitle.get(normalisedQuery);
    if (!match) return [];

    return [
      {
        url: match.imageUrl,
        thumbnailUrl: match.imageUrl,
        caption: match.title,
        width: 0,
        height: 0,
        photographerName: 'Musaium curated',
      },
    ];
  }
}
