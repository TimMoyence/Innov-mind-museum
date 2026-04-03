const mockRequest = jest.fn();
const mockMapAxiosError = jest.fn();

jest.mock('@/shared/infrastructure/httpClient', () => ({
  httpClient: { request: (...args: unknown[]) => mockRequest(...args) },
  mapAxiosError: (...args: unknown[]) => mockMapAxiosError(...args),
}));

jest.mock('@/shared/lib/errors', () => ({
  isAppError: (e: unknown) => e !== null && typeof e === 'object' && 'kind' in e && 'message' in e,
}));

import { httpRequest } from '@/shared/api/httpRequest';
import type { AppError } from '@/shared/types/AppError';

describe('httpRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets Content-Type for non-FormData body', async () => {
    mockRequest.mockResolvedValue({ data: { ok: true } });

    await httpRequest('/test', { method: 'POST', body: '{"a":1}' });

    const config = mockRequest.mock.calls[0][0] as Record<string, unknown>;
    const headers = config.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('skips Content-Type for FormData', async () => {
    mockRequest.mockResolvedValue({ data: { ok: true } });

    const form = new FormData();
    await httpRequest('/upload', { method: 'POST', body: form });

    const config = mockRequest.mock.calls[0][0] as Record<string, unknown>;
    const headers = config.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('defaults to GET method', async () => {
    mockRequest.mockResolvedValue({ data: 'ok' });

    await httpRequest('/items');

    const config = mockRequest.mock.calls[0][0] as Record<string, unknown>;
    expect(config.method).toBe('GET');
  });

  it('re-throws AppError as-is', async () => {
    const appError: AppError = { kind: 'Network', message: 'Offline' };
    mockRequest.mockRejectedValue(appError);

    await expect(httpRequest('/fail')).rejects.toEqual(appError);
    expect(mockMapAxiosError).not.toHaveBeenCalled();
  });

  it('maps unknown errors via mapAxiosError', async () => {
    const rawError = new Error('axios boom');
    const mapped: AppError = { kind: 'Unknown', message: 'Something went wrong' };
    mockRequest.mockRejectedValue(rawError);
    mockMapAxiosError.mockReturnValue(mapped);

    await expect(httpRequest('/fail')).rejects.toEqual(mapped);
    expect(mockMapAxiosError).toHaveBeenCalledWith(rawError);
  });

  it('returns parsed response data', async () => {
    const payload = { users: [{ id: 1 }] };
    mockRequest.mockResolvedValue({ data: payload });

    const result = await httpRequest('/users');
    expect(result).toEqual(payload);
  });
});
