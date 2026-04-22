import { HttpWikipediaClient } from '@modules/museum/adapters/secondary/wikipedia.client';

type FetchMock = jest.SpyInstance<ReturnType<typeof fetch>, Parameters<typeof fetch>>;

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: new Headers(),
  } as unknown as Response;
}

describe('HttpWikipediaClient.fetchSummary', () => {
  let fetchSpy: FetchMock;
  const client = new HttpWikipediaClient();

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch') as unknown as FetchMock;
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns extract for given title+locale', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        title: 'Louvre',
        extract: 'The Louvre is the world-famous art museum in Paris.',
        extract_html: '<p>The Louvre is the world-famous art museum in Paris.</p>',
        content_urls: { desktop: { page: 'https://fr.wikipedia.org/wiki/Louvre' } },
      }),
    );

    const summary = await client.fetchSummary({ title: 'Louvre', locale: 'fr' });

    expect(summary).toEqual({
      title: 'Louvre',
      extract: 'The Louvre is the world-famous art museum in Paris.',
      extractHtml: '<p>The Louvre is the world-famous art museum in Paris.</p>',
      pageUrl: 'https://fr.wikipedia.org/wiki/Louvre',
    });
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('fr.wikipedia.org');
  });

  it('returns null on 404', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}, false, 404));

    const summary = await client.fetchSummary({ title: 'DoesNotExist', locale: 'en' });

    expect(summary).toBeNull();
  });

  it('returns null on network error (fail-open)', async () => {
    fetchSpy.mockRejectedValue(new Error('ETIMEDOUT'));

    const summary = await client.fetchSummary({ title: 'Louvre', locale: 'fr' });

    expect(summary).toBeNull();
  });

  it('returns null on blank title', async () => {
    const summary = await client.fetchSummary({ title: '   ', locale: 'fr' });

    expect(summary).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to default English when locale is invalid', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ title: 'Louvre', extract: 'x', content_urls: undefined }),
    );

    await client.fetchSummary({ title: 'Louvre', locale: 'INVALID!!!' });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('en.wikipedia.org');
  });

  it('encodes title correctly in URL (spaces, accents)', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ title: 'Musée du Louvre', extract: 'x', content_urls: undefined }),
    );

    await client.fetchSummary({ title: 'Musée du Louvre', locale: 'fr' });

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    // encodeURIComponent("Musée du Louvre") = "Mus%C3%A9e%20du%20Louvre"
    expect(calledUrl).toContain('Mus%C3%A9e%20du%20Louvre');
    expect(calledUrl).not.toContain('Musée du Louvre');
  });

  it('builds fallback pageUrl from title when content_urls missing', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ title: 'Louvre', extract: 'x', content_urls: undefined }),
    );

    const summary = await client.fetchSummary({ title: 'Louvre', locale: 'fr' });

    expect(summary?.pageUrl).toBe('https://fr.wikipedia.org/wiki/Louvre');
  });
});
