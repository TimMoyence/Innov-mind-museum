type RefreshResult =
  | { kind: 'success'; accessToken: string }
  | { kind: 'invalid' }
  | { kind: 'transient' };

const mockRunAuthRefresh = jest.fn<Promise<RefreshResult>, []>();
jest.mock('@/shared/infrastructure/httpClient', () => ({
  runAuthRefresh: () => mockRunAuthRefresh(),
}));

import { authSessionService } from '@/features/auth/infrastructure/authSessionService';

describe('authSessionService (C1 hexagonal façade)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refresh() returns the success result from the underlying runAuthRefresh', async () => {
    mockRunAuthRefresh.mockResolvedValueOnce({ kind: 'success', accessToken: 'fresh-jwt' });

    const result = await authSessionService.refresh();

    expect(result).toEqual({ kind: 'success', accessToken: 'fresh-jwt' });
    expect(mockRunAuthRefresh).toHaveBeenCalledTimes(1);
  });

  it('refresh() passes through the invalid discriminator (terminal failure)', async () => {
    mockRunAuthRefresh.mockResolvedValueOnce({ kind: 'invalid' });

    await expect(authSessionService.refresh()).resolves.toEqual({ kind: 'invalid' });
  });

  it('refresh() passes through the transient discriminator (network/5xx)', async () => {
    mockRunAuthRefresh.mockResolvedValueOnce({ kind: 'transient' });

    await expect(authSessionService.refresh()).resolves.toEqual({ kind: 'transient' });
  });

  it('refresh() does not swallow errors thrown by the underlying primitive', async () => {
    const err = new Error('handler-not-registered');
    mockRunAuthRefresh.mockRejectedValueOnce(err);

    await expect(authSessionService.refresh()).rejects.toBe(err);
  });
});
