import { normalizeForScoring } from '@modules/chat/useCase/image/image-scoring';
import { artworks } from '@modules/daily-art/adapters/secondary/catalog/artworks.data';

import type {
  ImageSourceClient,
  ImageSourcePhoto,
} from '@modules/chat/domain/ports/image-source.port';
import type { Artwork } from '@modules/daily-art/domain/artwork.types';

/**
 * Internal Musaium curated catalogue (C2 v2, 2026-05). Reads static `artworks.data.ts`
 * (Decision D2 design.md) — no DB / network. At most 1 result on exact normalised title
 * match (Q4 RESOLVED: exact normalised, no fuzzy). `normalizeForScoring` = lowercase +
 * NFD + strip diacritics so "mona lísa" matches "Mona Lisa".
 */
export class MusaiumCatalogueClient implements ImageSourceClient {
  // Catalogue is `readonly Artwork[]` frozen at module load — safe to index once.
  private readonly indexByTitle: Map<string, Artwork>;

  constructor(catalogue: readonly Artwork[] = artworks) {
    const index = new Map<string, Artwork>();
    for (const artwork of catalogue) {
      index.set(normalizeForScoring(artwork.title), artwork);
    }
    this.indexByTitle = index;
  }

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
