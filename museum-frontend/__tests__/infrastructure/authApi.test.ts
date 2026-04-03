import { makeAuthTokens } from '../helpers/factories';

const mockOpenApiRequest = jest.fn();
jest.mock('@/shared/api/openapiClient', () => ({
  openApiRequest: (...args: unknown[]) => mockOpenApiRequest(...args),
}));

const mockClearAccessToken = jest.fn();
jest.mock('@/features/auth/infrastructure/authTokenStore', () => ({
  clearAccessToken: () => mockClearAccessToken(),
}));

import { authService } from '@/features/auth/infrastructure/authApi';

describe('authApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('login sends email+password to /api/auth/login', async () => {
    const tokens = makeAuthTokens();
    mockOpenApiRequest.mockResolvedValue(tokens);

    const result = await authService.login('user@test.com', 'secret123');

    expect(mockOpenApiRequest).toHaveBeenCalledWith({
      path: '/api/auth/login',
      method: 'post',
      body: JSON.stringify({ email: 'user@test.com', password: 'secret123' }),
      requiresAuth: false,
    });
    expect(result).toEqual(tokens);
  });

  it('register sends POST /api/auth/register', async () => {
    mockOpenApiRequest.mockResolvedValue(undefined);
    const payload = {
      email: 'new@test.com',
      password: 'pw123456',
      firstname: 'Tim',
      lastname: 'K',
    };

    await authService.register(payload as never);

    expect(mockOpenApiRequest).toHaveBeenCalledWith({
      path: '/api/auth/register',
      method: 'post',
      body: JSON.stringify(payload),
      requiresAuth: false,
    });
  });

  it('refresh sends refreshToken with requiresAuth=false', async () => {
    const tokens = makeAuthTokens();
    mockOpenApiRequest.mockResolvedValue(tokens);

    const result = await authService.refresh('my-refresh-token');

    expect(mockOpenApiRequest).toHaveBeenCalledWith({
      path: '/api/auth/refresh',
      method: 'post',
      body: JSON.stringify({ refreshToken: 'my-refresh-token' }),
      requiresAuth: false,
    });
    expect(result).toEqual(tokens);
  });

  it('logout calls clearAccessToken after request', async () => {
    const logoutResponse = { message: 'Logged out' };
    mockOpenApiRequest.mockResolvedValue(logoutResponse);

    const result = await authService.logout('rt-123');

    expect(mockOpenApiRequest).toHaveBeenCalledWith({
      path: '/api/auth/logout',
      method: 'post',
      body: JSON.stringify({ refreshToken: 'rt-123' }),
      requiresAuth: false,
    });
    expect(mockClearAccessToken).toHaveBeenCalledTimes(1);
    expect(result).toEqual(logoutResponse);
  });

  it('deleteAccount calls DELETE /api/auth/account', async () => {
    const deleteResponse = { message: 'Account deleted' };
    mockOpenApiRequest.mockResolvedValue(deleteResponse);

    const result = await authService.deleteAccount();

    expect(mockOpenApiRequest).toHaveBeenCalledWith({
      path: '/api/auth/account',
      method: 'delete',
    });
    expect(result).toEqual(deleteResponse);
  });

  it('me fetches the current user profile', async () => {
    const profile = { id: 1, email: 'me@test.com', role: 'visitor' };
    mockOpenApiRequest.mockResolvedValue(profile);

    const result = await authService.me();

    expect(mockOpenApiRequest).toHaveBeenCalledWith({
      path: '/api/auth/me',
      method: 'get',
    });
    expect(result).toEqual(profile);
  });

  it('socialLogin sends provider and idToken', async () => {
    const tokens = makeAuthTokens();
    mockOpenApiRequest.mockResolvedValue(tokens);

    const result = await authService.socialLogin('apple', 'id-token-abc');

    expect(mockOpenApiRequest).toHaveBeenCalledWith({
      path: '/api/auth/social-login',
      method: 'post',
      body: JSON.stringify({ provider: 'apple', idToken: 'id-token-abc' }),
      requiresAuth: false,
    });
    expect(result).toEqual(tokens);
  });

  it('completeOnboarding sends PATCH /api/auth/onboarding-complete', async () => {
    mockOpenApiRequest.mockResolvedValue({});

    await authService.completeOnboarding();

    expect(mockOpenApiRequest).toHaveBeenCalledWith({
      path: '/api/auth/onboarding-complete',
      method: 'patch',
    });
  });

  it('forgotPassword sends email to /api/auth/forgot-password', async () => {
    mockOpenApiRequest.mockResolvedValue({ message: 'Email sent' });

    await authService.forgotPassword('user@test.com');

    expect(mockOpenApiRequest).toHaveBeenCalledWith({
      path: '/api/auth/forgot-password',
      method: 'post',
      body: JSON.stringify({ email: 'user@test.com' }),
      requiresAuth: false,
    });
  });

  it('resetPassword sends token and newPassword', async () => {
    mockOpenApiRequest.mockResolvedValue({ message: 'Password reset' });

    await authService.resetPassword('reset-token-xyz', 'newPass!123');

    expect(mockOpenApiRequest).toHaveBeenCalledWith({
      path: '/api/auth/reset-password',
      method: 'post',
      body: JSON.stringify({ token: 'reset-token-xyz', newPassword: 'newPass!123' }),
      requiresAuth: false,
    });
  });

  it('changePassword sends currentPassword and newPassword', async () => {
    mockOpenApiRequest.mockResolvedValue({});

    await authService.changePassword('oldPass', 'newPass');

    expect(mockOpenApiRequest).toHaveBeenCalledWith({
      path: '/api/auth/change-password',
      method: 'put',
      body: JSON.stringify({ currentPassword: 'oldPass', newPassword: 'newPass' }),
    });
  });

  it('exportData calls GET /api/auth/export-data', async () => {
    const exportPayload = { user: { id: 1 }, sessions: [] };
    mockOpenApiRequest.mockResolvedValue(exportPayload);

    const result = await authService.exportData();

    expect(mockOpenApiRequest).toHaveBeenCalledWith({
      path: '/api/auth/export-data',
      method: 'get',
    });
    expect(result).toEqual(exportPayload);
  });
});
