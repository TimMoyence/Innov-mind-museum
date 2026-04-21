import type {
  UnsplashClient,
  UnsplashPhoto,
} from '@modules/chat/adapters/secondary/unsplash.client';

export function makeUnsplashPhoto(overrides: Partial<UnsplashPhoto> = {}): UnsplashPhoto {
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
export function makeUnsplashClientMock(photos: UnsplashPhoto[] = []): jest.Mocked<UnsplashClient> {
  return {
    searchPhotos: jest.fn().mockResolvedValue(photos),
  } as unknown as jest.Mocked<UnsplashClient>;
}
