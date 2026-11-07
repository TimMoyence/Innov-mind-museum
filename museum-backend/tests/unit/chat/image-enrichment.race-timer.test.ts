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

describe('ImageEnrichmentService — délai de course', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('TIMER · une source qui répond avant le délai ne laisse aucun minuteur armé', async () => {
    jest.useFakeTimers();
    const unsplash = makeUnsplashClientMock([makeUnsplashPhoto()]);
    const service = new ImageEnrichmentService(unsplash, CONFIG);

    await expect(service.enrich('Mona Lisa')).resolves.toHaveLength(1);

    expect(jest.getTimerCount()).toBe(0);
  });
});
