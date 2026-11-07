import { createCachedNominatimClient } from '@shared/http/nominatim.client';

import { makeCache } from '../../helpers/chat/cache.fixtures';

jest.mock('@shared/logger/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const ttlOfStoredEntry = (cache: ReturnType<typeof makeCache>): unknown =>
  cache.set.mock.calls[0]?.[2];

describe('createCachedNominatimClient — une panne de Nominatim ne se garde qu’une minute', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('PANNE-CACHE · un 503 de Nominatim ne se garde que 60 s, comme une panne d’Overpass', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      }) as unknown as typeof fetch;
    const cache = makeCache();

    await expect(createCachedNominatimClient(cache)(48.8606, 2.3376)).resolves.toBeNull();

    expect(ttlOfStoredEntry(cache)).toBe(60);
  });

  it('PANNE-CACHE · une adresse vraiment introuvable garde la durée négative configurée', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
    const cache = makeCache();

    await expect(createCachedNominatimClient(cache)(48.8606, 2.3376)).resolves.toBeNull();

    expect(ttlOfStoredEntry(cache)).toBe(3600);
  });
});
