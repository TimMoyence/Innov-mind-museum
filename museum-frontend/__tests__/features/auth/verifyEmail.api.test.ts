/**
 * RED — TD-RNAV-01 cycle 2, T1.2 (R1).
 *
 * `authService.verifyEmail(token)` does NOT exist yet — the suite MUST fail
 * (calling an undefined method throws), then turn green once the method is
 * added in the GREEN phase.
 *
 * Contract (design §4 / §6.2): POST /api/auth/verify-email with body
 * `{ token }`, `requiresAuth: false`, resolving to the backend `{ verified }`
 * payload. Mirrors the existing `confirmEmailChange` shape (authApi.ts:254-263)
 * and the generated OpenAPI contract (openapi.ts:1013-1041).
 */
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
      body: JSON.stringify({ token: 'TKN' }),
      requiresAuth: false,
    });
  });

  it('resolves to the backend { verified } payload', async () => {
    mockOpenApiRequest.mockResolvedValue({ verified: true });

    const result = await authService.verifyEmail('TKN');

    expect(result).toEqual({ verified: true });
  });
});
