import type { ImageSourcePhoto } from '@modules/chat/domain/ports/image-source.port';
import type { UnsplashClient } from '@modules/chat/adapters/secondary/search/unsplash.client';

export function makeUnsplashPhoto(overrides: Partial<ImageSourcePhoto> = {}): ImageSourcePhoto {
  return {
    url: 'https://unsplash.com/photo1.jpg',
    thumbnailUrl: 'https://unsplash.com/photo1_thumb.jpg',
    caption: 'Test photo caption',
    width: 1920,
    height: 1080,
    photographerName: 'Test Photographer',
    ...overrides,
  };
}

/** Returns a fully-typed jest mock of UnsplashClient (single method: searchPhotos). */
export function makeUnsplashClientMock(
  photos: ImageSourcePhoto[] = [],
): jest.Mocked<UnsplashClient> {
  return {
    searchPhotos: jest.fn().mockResolvedValue(photos),
  } as unknown as jest.Mocked<UnsplashClient>;
}
