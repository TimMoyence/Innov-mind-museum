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

jest.mock('pako', () => ({
  gzip: (...args: unknown[]) => mockGzip(...args),
}));

import { httpRequest } from '@/shared/api/httpRequest';

interface RequestConfig {
  data?: unknown;
  headers?: Record<string, string>;
}

const largeJsonString = (): string => JSON.stringify({ blob: 'x'.repeat(2000) });

const smallJsonString = (): string => JSON.stringify({ a: 1 });

const lastConfig = (): RequestConfig => mockRequest.mock.calls[0][0] as RequestConfig;

describe('httpRequest conditional gzip (W1-GZIP-05)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest.mockResolvedValue({ data: { ok: true } });
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
    expect(config.headers?.['Content-Type']).toBeUndefined();
  });
});
