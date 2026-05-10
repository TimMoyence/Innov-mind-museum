jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { WikimediaCommonsClient } from '@modules/chat/adapters/secondary/search/wikimedia-commons.client';

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

describe('WikimediaCommonsClient (C2 v2)', () => {
  it('returns mapped photos on a successful 2-stage response (R5 happy path)', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            query: { search: [{ title: 'File:MonaLisa.jpg' }] },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            query: {
              pages: {
                '1': {
                  title: 'File:MonaLisa.jpg',
                  imageinfo: [
                    {
                      url: 'https://commons.example/MonaLisa.jpg',
                      thumburl: 'https://commons.example/thumb.jpg',
                      width: 800,
                      height: 600,
                      extmetadata: {
                        ImageDescription: { value: 'Mona Lisa portrait' },
                        Artist: { value: 'Leonardo da Vinci' },
                        LicenseShortName: { value: 'CC BY-SA 4.0' },
                      },
                    },
                  ],
                },
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new WikimediaCommonsClient();
    const photos = await client.searchPhotos('Mona Lisa', 1);

    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({
      url: 'https://commons.example/MonaLisa.jpg',
      thumbnailUrl: 'https://commons.example/thumb.jpg',
      caption: 'Mona Lisa portrait',
      photographerName: 'Leonardo da Vinci',
      width: 800,
      height: 600,
    });
    // Stage 1 URL hits the search endpoint with namespace 6 (File:)
    const firstUrl = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(firstUrl).toContain('list=search');
    expect(firstUrl).toContain('srnamespace=6');
  });

  it('returns [] when stage 1 search hits HTTP 429 (rate-limit fail-open)', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429 })) as unknown as typeof fetch;

    const client = new WikimediaCommonsClient();
    expect(await client.searchPhotos('foo')).toEqual([]);
  });

  it('returns [] on malformed JSON payload (defence-in-depth)', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(
      new Response('not-json-at-all', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ) as unknown as typeof fetch;

    const client = new WikimediaCommonsClient();
    expect(await client.searchPhotos('foo')).toEqual([]);
  });

  it('returns [] when stage 1 returns empty results (no titles to enrich)', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ query: { search: [] } }), { status: 200 }),
    ) as unknown as typeof fetch;

    const client = new WikimediaCommonsClient();
    expect(await client.searchPhotos('foo')).toEqual([]);
  });

  it('aborts on timeout (R5 timeout branch)', async () => {
    // Both stages are mocked to never resolve so the AbortController fires.
    global.fetch = jest.fn().mockImplementation(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('This operation was aborted'));
          });
        }),
    ) as unknown as typeof fetch;

    const client = new WikimediaCommonsClient(50);
    expect(await client.searchPhotos('foo')).toEqual([]);
  });

  it('returns [] when query is whitespace-only (early bail)', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new WikimediaCommonsClient();
    expect(await client.searchPhotos('   ')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
