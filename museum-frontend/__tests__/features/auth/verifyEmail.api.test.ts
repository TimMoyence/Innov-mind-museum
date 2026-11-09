const mockOpenApiRequest = jest.fn();
jest.mock('@/shared/api/openapiClient', () => ({
  openApiRequest: (...args: unknown[]) => mockOpenApiRequest(...args),
}));

const mockClearAccessToken = jest.fn();
jest.mock('@/features/auth/infrastructure/authTokenStore', () => ({
  clearAccessToken: () => mockClearAccessToken(),
}));

import { authService } from '@/features/auth/infrastructure/authApi';

describe('authApi.verifyEmail (R1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POSTs /api/auth/verify-email with { token } and requiresAuth=false', async () => {
    mockOpenApiRequest.mockResolvedValue({ verified: true });

    await authService.verifyEmail('TKN');

    expect(mockOpenApiRequest).toHaveBeenCalledTimes(1);
    expect(mockOpenApiRequest).toHaveBeenCalledWith({
      path: '/api/auth/verify-email',
      method: 'post',
      json: { token: 'TKN' },
      requiresAuth: false,
    });
  });

  it('resolves to the backend { verified } payload', async () => {
    mockOpenApiRequest.mockResolvedValue({ verified: true });

    const result = await authService.verifyEmail('TKN');

    expect(result).toEqual({ verified: true });
  });
});
