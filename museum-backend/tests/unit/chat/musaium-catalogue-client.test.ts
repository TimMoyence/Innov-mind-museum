import { MusaiumCatalogueClient } from '@modules/chat/adapters/secondary/search/musaium-catalogue.client';

import type { Artwork } from '@modules/daily-art/domain/artwork.types';

const fixtureCatalogue: readonly Artwork[] = [
  {
    title: 'Mona Lisa',
    artist: 'Leonardo da Vinci',
    year: 'c. 1503-1519',
    imageUrl: 'https://example.com/mona-lisa.jpg',
    description: 'A famous portrait',
    funFact: 'Has her own mailbox at the Louvre.',
    museum: 'Louvre, Paris',
  },
  {
    title: 'The Starry Night',
    artist: 'Vincent van Gogh',
    year: '1889',
    imageUrl: 'https://example.com/starry-night.jpg',
    description: 'Swirling night sky.',
    funFact: 'Painted from memory during the day.',
    museum: 'MoMA, New York',
  },
];

describe('MusaiumCatalogueClient (C2 v2)', () => {
  it('returns the matched artwork as ImageSourcePhoto on exact title match (R4)', async () => {
    const client = new MusaiumCatalogueClient(fixtureCatalogue);
    const photos = await client.searchPhotos('Mona Lisa');
    expect(photos).toHaveLength(1);
    expect(photos[0]).toEqual({
      url: 'https://example.com/mona-lisa.jpg',
      thumbnailUrl: 'https://example.com/mona-lisa.jpg',
      caption: 'Mona Lisa',
      width: 0,
      height: 0,
      photographerName: 'Musaium curated',
    });
  });

  it('matches case-insensitively (Q4 RESOLVED — exact normalised match)', async () => {
    const client = new MusaiumCatalogueClient(fixtureCatalogue);
    const photos = await client.searchPhotos('mona lisa');
    expect(photos).toHaveLength(1);
    expect(photos[0].caption).toBe('Mona Lisa');
  });

  it('matches with diacritic normalisation (mona lísa → Mona Lisa)', async () => {
    const client = new MusaiumCatalogueClient(fixtureCatalogue);
    const photos = await client.searchPhotos('Mona Lísa');
    expect(photos).toHaveLength(1);
    expect(photos[0].caption).toBe('Mona Lisa');
  });

  it('returns [] when no title matches', async () => {
    const client = new MusaiumCatalogueClient(fixtureCatalogue);
    expect(await client.searchPhotos('Random Title Not Listed')).toEqual([]);
  });

  it('returns [] for empty / whitespace queries (early bail, R4 invariant)', async () => {
    const client = new MusaiumCatalogueClient(fixtureCatalogue);
    expect(await client.searchPhotos('')).toEqual([]);
    expect(await client.searchPhotos('   ')).toEqual([]);
  });

  it('preserves multi-word titles exactly (no fuzzy match)', async () => {
    const client = new MusaiumCatalogueClient(fixtureCatalogue);
    expect(await client.searchPhotos('Starry Night')).toEqual([]); // 'The' missing → no match
    const exact = await client.searchPhotos('The Starry Night');
    expect(exact).toHaveLength(1);
    expect(exact[0].caption).toBe('The Starry Night');
  });

  it('reads default catalogue when no override provided (smoke — uses real artworks.data)', async () => {
    const client = new MusaiumCatalogueClient();
    // Use a title we know is in the curated 30-list.
    const photos = await client.searchPhotos('Mona Lisa');
    expect(photos.length).toBeGreaterThanOrEqual(1);
  });
});
