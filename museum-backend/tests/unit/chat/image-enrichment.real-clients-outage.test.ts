import { UnsplashClient } from '@modules/chat/adapters/secondary/search/unsplash.client';
import { WikimediaCommonsClient } from '@modules/chat/adapters/secondary/search/wikimedia-commons.client';
import { ImageEnrichmentService } from '@modules/chat/useCase/image/image-enrichment.service';

import { makeUnsplashApiResult } from '../../helpers/search-clients/unsplash.fixture';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const CONFIG = {
  cacheTtlMs: 60_000,
  cacheMaxEntries: 100,
  fetchTimeoutMs: 5_000,
  maxImagesPerResponse: 3,
};

describe('ImageEnrichmentService — panne vue par les vrais clients d’images', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('PANNE-CACHE · un 503 d’Unsplash vu par le vrai client ne se garde pas en cache : la demande suivante montre la photo', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ results: [makeUnsplashApiResult()] }),
      }) as unknown as typeof fetch;
    const service = new ImageEnrichmentService(new UnsplashClient('key'), CONFIG);

    await expect(service.enrich('Mona Lisa')).resolves.toEqual([]);
    await expect(service.enrich('Mona Lisa')).resolves.toHaveLength(1);
  });

  it('PANNE-CACHE · une coupure réseau de Commons vue par le vrai client ne se garde pas en cache : la demande suivante interroge Commons', async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue({ ok: true, json: async () => ({ query: { search: [] } }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new ImageEnrichmentService(undefined, CONFIG, new WikimediaCommonsClient());

    await service.enrich('Mona Lisa');
    await service.enrich('Mona Lisa');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
