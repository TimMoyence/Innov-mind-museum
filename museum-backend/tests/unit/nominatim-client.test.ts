import { geocodeWithNominatim } from '@shared/http/nominatim.client';

let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  fetchSpy = jest.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('geocodeWithNominatim', () => {
  it('returns coordinates for a successful geocoding response', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: '45.764043', lon: '4.835659' }],
    });

    const result = await geocodeWithNominatim('Lyon');

    expect(result).toEqual({ lat: 45.764043, lng: 4.835659 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Verify URL params
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('q=Lyon');
    expect(calledUrl).toContain('format=json');
    expect(calledUrl).toContain('limit=1');

    // Verify User-Agent header
    const calledOptions = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((calledOptions.headers as Record<string, string>)['User-Agent']).toBe('Musaium/1.0');
  });

  it('returns null for an empty response array', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const result = await geocodeWithNominatim('NonexistentPlace12345');

    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network failure'));

    const result = await geocodeWithNominatim('Lyon');

    expect(result).toBeNull();
  });

  it('returns null on non-OK HTTP status', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    });

    const result = await geocodeWithNominatim('Lyon');

    expect(result).toBeNull();
  });

  it('returns null when response is not an array', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: 'invalid' }),
    });

    const result = await geocodeWithNominatim('Lyon');

    expect(result).toBeNull();
  });

  it('returns null on timeout (abort signal)', async () => {
    fetchSpy.mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => {
            reject(new DOMException('The operation was aborted', 'AbortError'));
          }, 5);
        }),
    );

    const result = await geocodeWithNominatim('Lyon', 10);

    expect(result).toBeNull();
  });
});
