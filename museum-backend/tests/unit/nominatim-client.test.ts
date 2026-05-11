import { geocodeWithNominatim } from '@shared/http/nominatim.client';
import { logger } from '@shared/logger/logger';

// Suppress + spy logger output during tests
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

    // Verify URL params — including the accept-language=fr param (kills the
    // StringLiteral mutation on line 141 that empties the 'fr' literal).
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    const parsedUrl = new URL(calledUrl);
    expect(parsedUrl.searchParams.get('q')).toBe('Lyon');
    expect(parsedUrl.searchParams.get('format')).toBe('json');
    expect(parsedUrl.searchParams.get('limit')).toBe('1');
    expect(parsedUrl.searchParams.get('accept-language')).toBe('fr');

    // Verify fetch is called with the GET method (kills the StringLiteral
    // mutation on line 153 that empties the 'GET' literal).
    const calledOptions = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(calledOptions.method).toBe('GET');

    // Verify User-Agent header matches the OSMF-compliant format:
    //   Musaium/<version> (contact: <email>)
    const ua = (calledOptions.headers as Record<string, string>)['User-Agent'];
    expect(ua).toMatch(/^Musaium\/\S+ \(contact: \S+\)$/);

    // No warnings on happy path.
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
    // Covers the !Array.isArray(data) branch of the line-171 disjunction.
    // Combined with the empty-array test, this kills both the
    // ConditionalExpression→false and the LogicalOperator ||→&& mutations.
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
    // Kills:
    //  - BlockStatement {} mutation on the if-block body (line 161)
    //  - StringLiteral '' mutation on the warn event name (line 162)
    //  - ObjectLiteral {} mutation on the warn payload (line 162)
    expect(mockedLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'Nominatim API returned non-OK status',
      expect.objectContaining({ status: 429, statusText: 'Too Many Requests' }),
    );
  });

  it('returns null on non-OK 500 server error and propagates status + statusText to the log payload', async () => {
    // Boundary test: a different non-OK status to lock down the payload field
    // identities (status vs statusText, not transposed).
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
    // Covers the Number.isNaN(lat) branch of the line-179 disjunction, AND
    // exercises the inside-block on line 179:49 (BlockStatement mutation),
    // line 180 StringLiteral, and line 180:65 ObjectLiteral.
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
    // Covers the Number.isNaN(lng) branch of the line-179 disjunction.
    // Combined with the lat-NaN test above, this kills the
    // LogicalOperator ||→&& mutation (line 179) and ConditionalExpression→false.
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
    // Negative assertion: when lat and lng are both numeric, the NaN-check
    // branch must NOT fire. Pins the ||→&& mutation in place — if it flipped
    // to &&, both being non-NaN would still NOT enter the warning block, so
    // this test alone doesn't kill the operator mutation. The two NaN tests
    // above are what kill it; this just guards against false negatives on
    // the happy path.
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ lat: '45.764043', lon: '4.835659' }],
    });

    const result = await geocodeWithNominatim('Lyon');

    expect(result).toEqual({ lat: 45.764043, lng: 4.835659 });
    expect(mockedLogger.warn).not.toHaveBeenCalled();
  });

  it('aborts the in-flight fetch via AbortController when the timeout fires', async () => {
    // Kills the BlockStatement mutation on the setTimeout callback body
    // (line 144): emptying `controller.abort()` would prevent any abort,
    // and fetch would observe a non-aborted signal.
    //
    // NOTE: the source calls `await rateLimiter.acquire()` (~1s OSMF spacing)
    // BEFORE invoking fetch, so by the time our mock receives the signal it
    // is already aborted. We therefore check `signal.aborted` synchronously
    // (real fetch does the same) AND wire an abort listener for the rare
    // case where the signal is not yet aborted when the listener attaches.
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

    // Timeout 10ms — fires while the rate limiter is still awaiting.
    const result = await geocodeWithNominatim('Lyon', 10);

    expect(result).toBeNull();
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(true);

    // The warn payload must contain the abort error message.
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'Nominatim geocoding failed',
      expect.objectContaining({
        error: expect.stringContaining('aborted'),
        query: 'Lyon',
      }),
    );

    // Defensive: ensure the resolveFetch closure can be safely orphaned.
    resolveFetch?.({ ok: true, json: async () => [] });
  }, 15_000);
});
