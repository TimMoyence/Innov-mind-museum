import { clearAccessToken } from './authTokenStore';
import type { components, paths } from '@/shared/api/generated/openapi';
import {
  openApiRequest,
  type OpenApiJsonRequestBodyFor,
  type OpenApiResponseFor,
} from '@/shared/api/openapiClient';

type Schemas = components['schemas'];
type RegisterPayload = OpenApiJsonRequestBodyFor<'/api/auth/register', 'post'>;
type AuthMeResponse =
  paths['/api/auth/me']['get']['responses'][200]['content']['application/json'];
type AuthLogoutResponse =
  paths['/api/auth/logout']['post']['responses'][200]['content']['application/json'];
type SocialLoginPayload = OpenApiJsonRequestBodyFor<'/api/auth/social-login', 'post'>;
type DeleteAccountResponse =
  paths['/api/auth/account']['delete']['responses'][200]['content']['application/json'];

/** Response payload for successful login or token refresh, containing access and refresh tokens. */
export type LoginResponse = Schemas['AuthSessionResponse'];

/** Service for authentication operations (register, login, logout, social login, account management). */
export const authService = {
  /**
   * Registers a new user account.
   * @param payload - Registration fields (email, password, etc.).
   */
  async register(payload: RegisterPayload): Promise<void> {
    return openApiRequest({
      path: '/api/auth/register',
      method: 'post',
      body: JSON.stringify(payload),
      requiresAuth: false,
    }).then(() => undefined);
  },

  /**
   * Authenticates a user with email and password.
   * @param email - User email address.
   * @param password - User password.
   * @returns Session tokens on success.
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    return openApiRequest({
      path: '/api/auth/login',
      method: 'post',
      body: JSON.stringify({ email, password }),
      requiresAuth: false,
    });
  },

  /**
   * Exchanges a refresh token for a new access/refresh token pair.
   * @param refreshToken - The current refresh token.
   * @returns New session tokens.
   */
  async refresh(refreshToken: string): Promise<LoginResponse> {
    return openApiRequest({
      path: '/api/auth/refresh',
      method: 'post',
      body: JSON.stringify({ refreshToken }),
      requiresAuth: false,
    });
  },

  /** Fetches the currently authenticated user's profile. */
  async me(): Promise<AuthMeResponse> {
    return openApiRequest({
      path: '/api/auth/me',
      method: 'get',
    });
  },

  /**
   * Logs out the current user, invalidates the refresh token, and clears the in-memory access token.
   * @param refreshToken - Optional refresh token to revoke server-side.
   */
  async logout(refreshToken?: string | null): Promise<AuthLogoutResponse> {
    const response = await openApiRequest({
      path: '/api/auth/logout',
      method: 'post',
      body: JSON.stringify({ refreshToken: refreshToken ?? undefined }),
      requiresAuth: false,
    });

    clearAccessToken();

    return response;
  },

  /**
   * Authenticates via a social provider (Apple/Google).
   * @param provider - Social identity provider name.
   * @param idToken - Identity token obtained from the social provider SDK.
   * @returns Session tokens on success.
   */
  async socialLogin(provider: SocialLoginPayload['provider'], idToken: string): Promise<LoginResponse> {
    return openApiRequest({
      path: '/api/auth/social-login',
      method: 'post',
      body: JSON.stringify({ provider, idToken }),
      requiresAuth: false,
    });
  },

  /** Permanently deletes the authenticated user's account. */
  async deleteAccount(): Promise<DeleteAccountResponse> {
    return openApiRequest({
      path: '/api/auth/account',
      method: 'delete',
    });
  },

  /**
   * Requests a password-reset email.
   * @param email - Email address associated with the account.
   */
  async forgotPassword(email: string): Promise<OpenApiResponseFor<'/api/auth/forgot-password', 'post'>> {
    return openApiRequest({
      path: '/api/auth/forgot-password',
      method: 'post',
      body: JSON.stringify({ email }),
      requiresAuth: false,
    });
  },

  /**
   * Resets the user's password using a previously issued reset token.
   * @param token - Password reset token from the email link.
   * @param newPassword - The new password to set.
   */
  async resetPassword(token: string, newPassword: string): Promise<OpenApiResponseFor<'/api/auth/reset-password', 'post'>> {
    return openApiRequest({
      path: '/api/auth/reset-password',
      method: 'post',
      body: JSON.stringify({ token, newPassword }),
      requiresAuth: false,
    });
  },
};

/** Inferred type of the {@link authService} object, useful for dependency injection. */
export type AuthService = typeof authService;
