import { geocodeWithNominatim } from '@shared/http/nominatim.client';
import { logger } from '@shared/logger/logger';

jest.mock('@shared/logger/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockedLogger = logger as jest.Mocked<typeof logger>;

let fetchSpy: jest.SpyInstance;

beforeEach(() => {
  fetchSpy = jest.spyOn(globalThis, 'fetch');
  mockedLogger.warn.mockClear();
  mockedLogger.info.mockClear();
  mockedLogger.error.mockClear();
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

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    const parsedUrl = new URL(calledUrl);
    expect(parsedUrl.searchParams.get('q')).toBe('Lyon');
    expect(parsedUrl.searchParams.get('format')).toBe('json');
    expect(parsedUrl.searchParams.get('limit')).toBe('1');
    expect(parsedUrl.searchParams.get('accept-language')).toBe('fr');

    const calledOptions = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(calledOptions.method).toBe('GET');

    const ua = (calledOptions.headers as Record<string, string>)['User-Agent'];
    expect(ua).toMatch(/^Musaium\/\S+ \(contact: \S+\)$/);

    expect(mockedLogger.warn).not.toHaveBeenCalled();
  });

  it('returns null for an empty response array', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    });

    const result = await geocodeWithNominatim('NonexistentPlace12345');

    expect(result).toBeNull();
    expect(mockedLogger.warn).not.toHaveBeenCalled();
  });

  it('returns null when response is not an array', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: 'invalid' }),
    });

    const result = await geocodeWithNominatim('Lyon');

    expect(result).toBeNull();
    expect(mockedLogger.warn).not.toHaveBeenCalled();
  });

  it('returns null on network error and logs a warning with the failure details', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network failure'));

    const result = await geocodeWithNominatim('Lyon');

    expect(result).toBeNull();
    expect(mockedLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'Nominatim geocoding failed',
      expect.objectContaining({ error: 'Network failure', query: 'Lyon' }),
    );
  });

  it('returns null on non-Error rejection (string thrown) and stringifies the error', async () => {
    fetchSpy.mockRejectedValueOnce('boom-string');

    const result = await geocodeWithNominatim('Lyon');

    expect(result).toBeNull();
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'Nominatim geocoding failed',
      expect.objectContaining({ error: 'boom-string', query: 'Lyon' }),
    );
  });

  it('returns null on non-OK HTTP status and logs a warning with status + statusText', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    });

    const result = await geocodeWithNominatim('Lyon');

    expect(result).toBeNull();
    expect(mockedLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'Nominatim API returned non-OK status',
      expect.objectContaining({ status: 429, statusText: 'Too Many Requests' }),
    );
  });

  it('returns null on non-OK 500 server error and propagates status + statusText to the log payload', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const result = await geocodeWithNominatim('Lyon');

    expect(result).toBeNull();
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'Nominatim API returned non-OK status',
      expect.objectContaining({ status: 500, statusText: 'Internal Server Error' }),
    );
  });

  it('returns null when lat is unparseable (NaN) and logs the raw payload', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: 'not-a-number', lon: '4.835659' }],
    });

    const result = await geocodeWithNominatim('Lyon');

    expect(result).toBeNull();
    expect(mockedLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'Nominatim returned unparseable coordinates',
      expect.objectContaining({ raw: { lat: 'not-a-number', lon: '4.835659' } }),
    );
  });

  it('returns null when lng is unparseable (NaN) while lat is valid', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: '45.764043', lon: 'not-a-number' }],
    });

    const result = await geocodeWithNominatim('Lyon');

    expect(result).toBeNull();
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'Nominatim returned unparseable coordinates',
      expect.objectContaining({ raw: { lat: '45.764043', lon: 'not-a-number' } }),
    );
  });

  it('does NOT log a warning when both coordinates parse cleanly', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: '45.764043', lon: '4.835659' }],
    });

    const result = await geocodeWithNominatim('Lyon');

    expect(result).toEqual({ lat: 45.764043, lng: 4.835659 });
    expect(mockedLogger.warn).not.toHaveBeenCalled();
  });

  it('aborts the in-flight fetch via AbortController when the timeout fires', async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveFetch!: (value: unknown) => void;

    fetchSpy.mockImplementationOnce((_url: unknown, init?: RequestInit) => {
      capturedSignal = init?.signal ?? undefined;
      return new Promise((resolve, reject) => {
        resolveFetch = resolve;
        if (capturedSignal?.aborted) {
          reject(new DOMException('The operation was aborted', 'AbortError'));
          return;
        }
        capturedSignal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted', 'AbortError'));
        });
      });
    });

    const result = await geocodeWithNominatim('Lyon', 10);

    expect(result).toBeNull();
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(true);

    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'Nominatim geocoding failed',
      expect.objectContaining({
        error: expect.stringContaining('aborted'),
        query: 'Lyon',
      }),
    );

    resolveFetch?.({ ok: true, json: async () => [] });
  }, 15_000);
});
