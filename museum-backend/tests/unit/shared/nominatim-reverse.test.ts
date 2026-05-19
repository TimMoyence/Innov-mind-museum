import { reverseGeocodeWithNominatim } from '@shared/http/nominatim.client';
import { logger } from '@shared/logger/logger';

// Suppress + spy logger output during tests
jest.mock('@shared/logger/logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockedLogger = logger as jest.Mocked<typeof logger>;

describe('reverseGeocodeWithNominatim', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    mockedLogger.warn.mockClear();
    mockedLogger.info.mockClear();
    mockedLogger.error.mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns parsed result for a valid Nominatim response', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        display_name: 'Musee du Louvre, Rue de Rivoli, 1er Arrondissement, Paris, France',
        name: 'Musee du Louvre',
        address: {
          road: 'Rue de Rivoli',
          neighbourhood: '1er Arrondissement',
          suburb: 'Paris Centre',
          city: 'Paris',
          country: 'France',
        },
      }),
    });

    const result = await reverseGeocodeWithNominatim(48.8606, 2.3376);

    expect(result).not.toBeNull();
    expect(result!.displayName).toContain('Musee du Louvre');
    expect(result!.name).toBe('Musee du Louvre');
    expect(result!.address.road).toBe('Rue de Rivoli');
    expect(result!.address.city).toBe('Paris');
    expect(result!.address.country).toBe('France');
    expect(result!.address.suburb).toBe('Paris Centre');
    expect(mockedLogger.warn).not.toHaveBeenCalled();
  });

  it('falls back to town when city is absent', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        display_name: 'Some Place, Small Town, France',
        address: {
          road: 'Main Street',
          town: 'Small Town',
          country: 'France',
        },
      }),
    });

    const result = await reverseGeocodeWithNominatim(47.0, 3.0);

    expect(result).not.toBeNull();
    expect(result!.address.city).toBe('Small Town');
  });

  it('falls back to village when city and town are absent', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        display_name: 'Some Place, Tiny Village, France',
        address: {
          village: 'Tiny Village',
          country: 'France',
        },
      }),
    });

    const result = await reverseGeocodeWithNominatim(47.0, 3.0);

    expect(result).not.toBeNull();
    expect(result!.address.city).toBe('Tiny Village');
  });

  it('returns null on non-OK 429 response and logs the warning with status + statusText', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    });

    const result = await reverseGeocodeWithNominatim(48.8606, 2.3376);

    expect(result).toBeNull();
    // Kills:
    //  - BlockStatement {} mutation on the if-block (line 260)
    //  - StringLiteral '' mutation on the warn event name (line 261)
    //  - ObjectLiteral {} mutation on the warn payload (line 261)
    expect(mockedLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'Nominatim reverse API returned non-OK status',
      expect.objectContaining({ status: 429, statusText: 'Too Many Requests' }),
    );
  });

  it('returns null on non-OK 503 response and propagates the 503 + statusText to the log payload', async () => {
    // Boundary test to lock the payload field identities (status vs statusText).
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });

    const result = await reverseGeocodeWithNominatim(48.8606, 2.3376);

    expect(result).toBeNull();
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'Nominatim reverse API returned non-OK status',
      expect.objectContaining({ status: 503, statusText: 'Service Unavailable' }),
    );
  });

  it('returns null when display_name is empty', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        display_name: '',
        address: {},
      }),
    });

    const result = await reverseGeocodeWithNominatim(48.8606, 2.3376);

    expect(result).toBeNull();
    expect(mockedLogger.warn).not.toHaveBeenCalled();
  });

  // Kills L212/L216/L217 OptionalChaining mutations on `data.address?.city` /
  // `data.address?.road` / `data.address?.neighbourhood`: dropping the `?.`
  // throws TypeError when the response omits the `address` field entirely.
  // The original safely maps every address field to undefined and still
  // returns the typed result with the display_name.
  it('returns a partial result when the response omits the address field', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        display_name: 'Standalone display name with no address sub-object',
      }),
    });

    const result = await reverseGeocodeWithNominatim(48.8606, 2.3376);

    expect(result).not.toBeNull();
    expect(result?.displayName).toBe('Standalone display name with no address sub-object');
    expect(result?.address.city).toBeUndefined();
    expect(result?.address.road).toBeUndefined();
    expect(result?.address.neighbourhood).toBeUndefined();
    expect(result?.address.country).toBeUndefined();
    expect(result?.name).toBeUndefined();
  });

  it('returns null on fetch error and logs the warning with error message + lat + lng', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await reverseGeocodeWithNominatim(48.8606, 2.3376);

    expect(result).toBeNull();
    // Kills:
    //  - StringLiteral '' mutation on the catch warn event name (line 271)
    //  - ObjectLiteral {} mutation on the catch warn payload (line 271)
    expect(mockedLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'Nominatim reverse geocoding failed',
      expect.objectContaining({
        error: 'Network error',
        // W3 spec R7 (GDPR) — coords logged at 3-decimal precision only.
        lat_3dec: 48.861,
        lng_3dec: 2.338,
      }),
    );
  });

  it('stringifies a non-Error rejection when logging the catch payload', async () => {
    global.fetch = jest.fn().mockRejectedValue('reverse-boom');

    const result = await reverseGeocodeWithNominatim(12.34, 56.78);

    expect(result).toBeNull();
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'Nominatim reverse geocoding failed',
      expect.objectContaining({
        error: 'reverse-boom',
        lat_3dec: 12.34,
        lng_3dec: 56.78,
      }),
    );
  });

  it('returns null on abort (timeout simulation) and logs the abort error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    const result = await reverseGeocodeWithNominatim(48.8606, 2.3376, 100);

    expect(result).toBeNull();
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'Nominatim reverse geocoding failed',
      expect.objectContaining({
        error: expect.stringContaining('Aborted'),
        lat_3dec: 48.861,
        lng_3dec: 2.338,
      }),
    );
  });

  it('aborts the in-flight reverse fetch via AbortController when the timeout fires', async () => {
    // Kills the BlockStatement mutation on the reverse setTimeout callback
    // body (line 243): emptying `controller.abort()` would prevent abort.
    //
    // NOTE: the source `await rateLimiter.acquire()`s (~1s OSMF spacing)
    // BEFORE invoking fetch, so by the time our mock receives the signal it
    // is already aborted. We therefore check `signal.aborted` synchronously
    // (real fetch does the same) AND wire an abort listener for the rare
    // case where the signal is not yet aborted when the listener attaches.
    let capturedSignal: AbortSignal | undefined;
    let resolveFetch!: (value: unknown) => void;

    global.fetch = jest.fn().mockImplementation((_url: unknown, init?: RequestInit) => {
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

    const result = await reverseGeocodeWithNominatim(48.8606, 2.3376, 10);

    expect(result).toBeNull();
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(true);
    resolveFetch?.({ ok: true, json: async () => ({ display_name: '', address: {} }) });
  }, 15_000);

  it('sets name to undefined when response has no name', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        display_name: 'Some address, Paris, France',
        address: {
          road: 'Rue Test',
          city: 'Paris',
          country: 'France',
        },
      }),
    });

    const result = await reverseGeocodeWithNominatim(48.8606, 2.3376);

    expect(result).not.toBeNull();
    expect(result!.name).toBeUndefined();
  });

  it('sends correct query parameters', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        display_name: 'Test',
        address: {},
      }),
    });

    await reverseGeocodeWithNominatim(48.8606, 2.3376);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const calledUrl = new URL((global.fetch as jest.Mock).mock.calls[0][0] as string);
    expect(calledUrl.pathname).toBe('/reverse');
    expect(calledUrl.searchParams.get('lat')).toBe('48.8606');
    expect(calledUrl.searchParams.get('lon')).toBe('2.3376');
    expect(calledUrl.searchParams.get('format')).toBe('json');
    expect(calledUrl.searchParams.get('addressdetails')).toBe('1');
    expect(calledUrl.searchParams.get('zoom')).toBe('18');

    // Verify fetch is called with the GET method explicitly.
    const calledOptions = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect(calledOptions.method).toBe('GET');
  });

  it('sends a User-Agent header matching the OSMF-compliant format', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ display_name: 'Test', address: {} }),
    });

    await reverseGeocodeWithNominatim(48.8606, 2.3376);

    const fetchOptions = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const headers = fetchOptions.headers as Record<string, string>;
    expect(headers['User-Agent']).toMatch(/^Musaium\/\S+ \(contact: \S+\)$/);
  });
});
