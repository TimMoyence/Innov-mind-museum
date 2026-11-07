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

describe('ImageEnrichmentService — une erreur servie en HTTP 200 est une panne', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('PANNE-CACHE · un « ratelimited » de Commons servi en 200 ne se garde pas en cache : la demande suivante interroge Commons', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ error: { code: 'ratelimited' } }) })
      .mockResolvedValue({ ok: true, json: async () => ({ query: { search: [] } }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const service = new ImageEnrichmentService(undefined, CONFIG, new WikimediaCommonsClient());

    await service.enrich('Mona Lisa');
    await service.enrich('Mona Lisa');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('PANNE-CACHE · une réponse Unsplash 200 sans liste de résultats ne se garde pas en cache : la demande suivante montre la photo', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ errors: ['Rate Limit Exceeded'] }) })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ results: [makeUnsplashApiResult()] }),
      }) as unknown as typeof fetch;
    const service = new ImageEnrichmentService(new UnsplashClient('key'), CONFIG);

    await expect(service.enrich('Mona Lisa')).resolves.toEqual([]);
    await expect(service.enrich('Mona Lisa')).resolves.toHaveLength(1);
  });
});
