import { ImageEnrichmentService } from '@modules/chat/useCase/image/image-enrichment.service';

import {
  makeUnsplashClientMock,
  makeUnsplashPhoto,
} from '../../helpers/search-clients/unsplash.fixture';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const CONFIG = {
  cacheTtlMs: 60_000,
  cacheMaxEntries: 100,
  fetchTimeoutMs: 5_000,
  maxImagesPerResponse: 3,
};

describe('ImageEnrichmentService — une source en panne ne se garde pas en cache', () => {
  it('PANNE-CACHE · après une panne d’Unsplash, la demande suivante sur le même terme montre ses photos', async () => {
    const unsplash = makeUnsplashClientMock();
    unsplash.searchPhotos
      .mockRejectedValueOnce(new Error('Unsplash 503'))
      .mockResolvedValue([makeUnsplashPhoto()]);
    const service = new ImageEnrichmentService(unsplash, CONFIG);

    await expect(service.enrich('Mona Lisa')).resolves.toEqual([]);
    await expect(service.enrich('Mona Lisa')).resolves.toHaveLength(1);
    expect(unsplash.searchPhotos).toHaveBeenCalledTimes(2);
  });

  it('PANNE-CACHE · quand toutes les sources répondent, la liste se garde en cache', async () => {
    const unsplash = makeUnsplashClientMock();
    unsplash.searchPhotos.mockResolvedValue([makeUnsplashPhoto()]);
    const service = new ImageEnrichmentService(unsplash, CONFIG);

    await service.enrich('Mona Lisa');
    await expect(service.enrich('Mona Lisa')).resolves.toHaveLength(1);
    expect(unsplash.searchPhotos).toHaveBeenCalledTimes(1);
  });
});
