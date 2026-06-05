/**
 * W1-GZIP-05 (RED) — httpRequest conditional request-body gzip.
 *
 * spec.md §EARS R5:
 *   WHEN resolved low/edge AND JSON body > ~1024 bytes THE FE SHALL pako.gzip +
 *   set Content-Encoding gzip; NEVER gzip multipart; normal/≤1024 → uncompressed.
 *
 * design.md §Architecture (FE):
 *   In httpRequest, when NOT FormData AND resolved DataMode low/edge AND JSON
 *   byte-length > ~1024 → pako.gzip(body) → Uint8Array, set Content-Type
 *   application/json + Content-Encoding gzip. NEVER gzip multipart. ≤1024 or
 *   normal → uncompressed, no Content-Encoding.
 *
 * Seam: `getCurrentDataMode()` (shared/infrastructure/dataMode/currentDataMode)
 *   — same resolved-DataMode source the httpClient X-Data-Mode interceptor uses.
 *
 * Mocks mirror httpRequest.test.ts (httpClient.request + mapAxiosError +
 * isAppError) and additionally mock the DataMode seam + pako so we can assert
 * gzip was (or was not) invoked and that the request config carries the
 * compressed Uint8Array + Content-Encoding header.
 *
 * RED state: httpRequest.ts has no gzip branch — it never imports pako, never
 * reads getCurrentDataMode, and always forwards the raw `body`. So:
 *   - pako.gzip is never called (mockGzip.toHaveBeenCalled fails),
 *   - Content-Encoding is never set (header assertion fails),
 *   - config.data stays the raw string (Uint8Array assertion fails).
 *
 * Frozen-test invariant: byte-immutable once manifested (phase=green).
 */

const mockRequest = jest.fn();
const mockMapAxiosError = jest.fn();
const mockGetCurrentDataMode = jest.fn();
const mockGzip = jest.fn();

jest.mock('@/shared/infrastructure/httpClient', () => ({
  httpClient: { request: (...args: unknown[]) => mockRequest(...args) },
  mapAxiosError: (...args: unknown[]) => mockMapAxiosError(...args),
}));

jest.mock('@/shared/lib/errors', () => ({
  isAppError: (e: unknown) => e !== null && typeof e === 'object' && 'kind' in e && 'message' in e,
}));

jest.mock('@/shared/infrastructure/dataMode/currentDataMode', () => ({
  getCurrentDataMode: () => mockGetCurrentDataMode(),
}));

// pako is a REAL dependency (added W1-GZIP-07, green phase). Mock it normally —
// NOT `{ virtual: true }`. A virtual mock on an installed module gets bypassed
// once any other test in the same jest worker resolves the real `pako` first
// (the module map caches the real path), so `pako.gzip` would hit the real lib
// and `mockGzip` would see 0 calls — an order-dependent flake that only surfaces
// in the full `--findRelatedTests` suite, never when this file runs alone.
jest.mock('pako', () => ({
  gzip: (...args: unknown[]) => mockGzip(...args),
}));

import { httpRequest } from '@/shared/api/httpRequest';

interface RequestConfig {
  data?: unknown;
  headers?: Record<string, string>;
}

/** Builds a JSON string whose UTF-8 byte length exceeds 1024 bytes. */
const largeJsonString = (): string => JSON.stringify({ blob: 'x'.repeat(2000) });

/** Builds a JSON string whose UTF-8 byte length is well under 1024 bytes. */
const smallJsonString = (): string => JSON.stringify({ a: 1 });

const lastConfig = (): RequestConfig => mockRequest.mock.calls[0][0] as RequestConfig;

describe('httpRequest conditional gzip (W1-GZIP-05)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest.mockResolvedValue({ data: { ok: true } });
    // Default: the gzip mock returns a deterministic Uint8Array sentinel.
    mockGzip.mockReturnValue(new Uint8Array([1, 2, 3, 4]));
  });

  it('R5 — low mode + JSON string > 1024 bytes → gzip body + Content-Encoding gzip', async () => {
    mockGetCurrentDataMode.mockReturnValue('low');
    const body = largeJsonString();

    await httpRequest('/big', { method: 'POST', body });

    expect(mockGzip).toHaveBeenCalledTimes(1);

    const config = lastConfig();
    expect(config.data).toBeInstanceOf(Uint8Array);
    expect(config.headers?.['Content-Encoding']).toBe('gzip');
    expect(config.headers?.['Content-Type']).toBe('application/json');
  });

  it('R5 — low mode + JSON object > 1024 bytes (serialized) → gzip body + Content-Encoding gzip', async () => {
    mockGetCurrentDataMode.mockReturnValue('low');
    const body = { blob: 'y'.repeat(2000) };

    await httpRequest('/big-obj', { method: 'POST', body });

    expect(mockGzip).toHaveBeenCalledTimes(1);
    const config = lastConfig();
    expect(config.data).toBeInstanceOf(Uint8Array);
    expect(config.headers?.['Content-Encoding']).toBe('gzip');
  });

  it('R5 — normal mode + large JSON → NOT compressed, no Content-Encoding', async () => {
    mockGetCurrentDataMode.mockReturnValue('normal');
    const body = largeJsonString();

    await httpRequest('/big', { method: 'POST', body });

    expect(mockGzip).not.toHaveBeenCalled();
    const config = lastConfig();
    expect(config.data).toBe(body);
    expect(config.headers?.['Content-Encoding']).toBeUndefined();
  });

  it('R5 — low mode + small JSON (≤1024 bytes) → NOT compressed, no Content-Encoding', async () => {
    mockGetCurrentDataMode.mockReturnValue('low');
    const body = smallJsonString();

    await httpRequest('/small', { method: 'POST', body });

    expect(mockGzip).not.toHaveBeenCalled();
    const config = lastConfig();
    expect(config.data).toBe(body);
    expect(config.headers?.['Content-Encoding']).toBeUndefined();
  });

  it('R5 — low mode + FormData (large) → NEVER gzip, no Content-Encoding', async () => {
    mockGetCurrentDataMode.mockReturnValue('low');
    const form = new FormData();
    form.append('blob', 'z'.repeat(4000));

    await httpRequest('/upload', { method: 'POST', body: form });

    expect(mockGzip).not.toHaveBeenCalled();
    const config = lastConfig();
    expect(config.data).toBe(form);
    expect(config.headers?.['Content-Encoding']).toBeUndefined();
    // multipart Content-Type stays unset (axios derives it from FormData).
    expect(config.headers?.['Content-Type']).toBeUndefined();
  });
});
