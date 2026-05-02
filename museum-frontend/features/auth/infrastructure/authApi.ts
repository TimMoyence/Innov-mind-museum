import { clearAccessToken } from './authTokenStore';
import type { components, paths } from '@/shared/api/generated/openapi';
import {
  openApiRequest,
  type OpenApiJsonRequestBodyFor,
  type OpenApiResponseFor,
} from '@/shared/api/openapiClient';
import type { TtsVoice } from '@/features/settings/voice-catalog';

type Schemas = components['schemas'];
type RegisterPayload = OpenApiJsonRequestBodyFor<'/api/auth/register', 'post'>;
type AuthMeResponse = paths['/api/auth/me']['get']['responses'][200]['content']['application/json'];
type AuthLogoutResponse =
  paths['/api/auth/logout']['post']['responses'][200]['content']['application/json'];
type SocialLoginPayload = OpenApiJsonRequestBodyFor<'/api/auth/social-login', 'post'>;
type DeleteAccountResponse =
  paths['/api/auth/account']['delete']['responses'][200]['content']['application/json'];
type UpdateTtsVoiceResponse =
  paths['/api/auth/tts-voice']['patch']['responses'][200]['content']['application/json'];

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
   *
   * R16 — the backend now returns a discriminated union (`AuthSessionResponse
   * | MfaRequiredResponse`). This thin wrapper preserves the historical
   * `LoginResponse`-only contract for callers that don't yet handle MFA.
   * MFA-aware callers should consume `mfaApi.ts` (which exposes the same
   * envelope as `LoginEnvelope`) instead.
   *
   * @param email - User email address.
   * @param password - User password.
   * @returns Session tokens on success.
   * @throws Error when the backend returns an MFA challenge — caller must
   *   route through the dedicated MFA flow before reaching here.
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    const result = await openApiRequest({
      path: '/api/auth/login',
      method: 'post',
      body: JSON.stringify({ email, password }),
      requiresAuth: false,
    });
    if ('mfaRequired' in result) {
      throw new Error('MFA_REQUIRED');
    }
    return result;
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
   *
   * @param provider - Social identity provider name.
   * @param idToken - Identity token obtained from the social provider SDK.
   * @param nonce - Optional OIDC nonce previously obtained via {@link requestSocialNonce}
   *   and passed to the native SDK before sign-in. Required when the backend
   *   has `OIDC_NONCE_ENFORCE=true`. Backend asserts the JWT `nonce` claim
   *   matches (Google: direct compare; Apple: SHA-256(nonce) lowercase hex).
   * @returns Session tokens on success.
   */
  async socialLogin(
    provider: SocialLoginPayload['provider'],
    idToken: string,
    nonce?: string,
  ): Promise<LoginResponse> {
    return openApiRequest({
      path: '/api/auth/social-login',
      method: 'post',
      body: JSON.stringify(nonce ? { provider, idToken, nonce } : { provider, idToken }),
      requiresAuth: false,
    });
  },

  /**
   * F3 (2026-04-30) — Requests a single-use OIDC nonce from the backend.
   * Mobile MUST call this immediately before invoking the native social SDK
   * and pass the returned `nonce` to `signInWithApple` / `signInWithGoogle`.
   * The backend stores it in Redis with a 5-min TTL and asserts a single
   * consume on the matching `/social-login` call.
   *
   * @returns A 128-bit base64url nonce.
   */
  async requestSocialNonce(): Promise<{ nonce: string }> {
    return openApiRequest({
      path: '/api/auth/social-nonce',
      method: 'post',
      requiresAuth: false,
    });
  },

  /** Marks the authenticated user's onboarding as completed on the backend. */
  async completeOnboarding(): Promise<void> {
    return openApiRequest({
      path: '/api/auth/onboarding-complete',
      method: 'patch',
    }).then(() => undefined);
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
  async forgotPassword(
    email: string,
  ): Promise<OpenApiResponseFor<'/api/auth/forgot-password', 'post'>> {
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
  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<OpenApiResponseFor<'/api/auth/reset-password', 'post'>> {
    return openApiRequest({
      path: '/api/auth/reset-password',
      method: 'post',
      body: JSON.stringify({ token, newPassword }),
      requiresAuth: false,
    });
  },

  /**
   * Changes the authenticated user's password.
   * @param currentPassword - The user's current password.
   * @param newPassword - The new password to set.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return openApiRequest({
      path: '/api/auth/change-password',
      method: 'put',
      body: JSON.stringify({ currentPassword, newPassword }),
    }).then(() => undefined);
  },

  /**
   * Initiates an email change — sends a verification link to the new address.
   * @param newEmail - The new email address to switch to.
   * @param currentPassword - The user's current password for confirmation.
   */
  async changeEmail(
    newEmail: string,
    currentPassword: string,
  ): Promise<OpenApiResponseFor<'/api/auth/change-email', 'put'>> {
    return openApiRequest({
      path: '/api/auth/change-email',
      method: 'put',
      body: JSON.stringify({ newEmail, currentPassword }),
    });
  },

  /**
   * Confirms an email change using the token from the verification link.
   * @param token - The email-change confirmation token.
   */
  async confirmEmailChange(
    token: string,
  ): Promise<OpenApiResponseFor<'/api/auth/confirm-email-change', 'post'>> {
    return openApiRequest({
      path: '/api/auth/confirm-email-change',
      method: 'post',
      body: JSON.stringify({ token }),
      requiresAuth: false,
    });
  },

  /**
   * Exports the authenticated user's personal data (GDPR).
   * @returns The user's exported data payload.
   */
  async exportData(): Promise<OpenApiResponseFor<'/api/users/me/export', 'get'>> {
    return openApiRequest({
      path: '/api/users/me/export',
      method: 'get',
    });
  },

  /**
   * Updates the authenticated user's preferred TTS voice (Spec C T2.8).
   *
   * @param voice - One of the voices in {@link TTS_VOICES}, or `null` to
   *   reset the preference and fall back to the env-level default.
   * @returns The persisted preference as confirmed by the backend.
   */
  async updateTtsVoice(voice: TtsVoice | null): Promise<UpdateTtsVoiceResponse> {
    return openApiRequest({
      path: '/api/auth/tts-voice',
      method: 'patch',
      body: JSON.stringify({ voice }),
    });
  },
};
