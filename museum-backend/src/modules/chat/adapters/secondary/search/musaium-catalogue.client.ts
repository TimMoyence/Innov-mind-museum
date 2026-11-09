import { normalizeForScoring } from '@modules/chat/useCase/image/image-scoring';
import { artworks } from '@modules/daily-art/adapters/secondary/catalog/artworks.data';

import type {
  ImageSourceClient,
  ImageSourcePhoto,
} from '@modules/chat/domain/ports/image-source.port';
import type { Artwork } from '@modules/daily-art/domain/artwork.types';

export class MusaiumCatalogueClient implements ImageSourceClient {
  private readonly indexByTitle: Map<string, Artwork>;

  constructor(catalogue: readonly Artwork[] = artworks) {
    const index = new Map<string, Artwork>();
    for (const artwork of catalogue) {
      index.set(normalizeForScoring(artwork.title), artwork);
    }
    this.indexByTitle = index;
  }

  searchPhotos(query: string, _perPage?: number): Promise<ImageSourcePhoto[]> {
    const normalisedQuery = normalizeForScoring(query);
    if (!normalisedQuery) return Promise.resolve([]);

    const match = this.indexByTitle.get(normalisedQuery);
    if (!match) return Promise.resolve([]);

    return Promise.resolve([
      {
        url: match.imageUrl,
        thumbnailUrl: match.imageUrl,
        caption: match.title,
        width: 0,
        height: 0,
        photographerName: 'Musaium curated',
      },
    ]);
  }
}
