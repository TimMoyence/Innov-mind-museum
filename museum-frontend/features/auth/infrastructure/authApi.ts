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

export type LoginResponse = Schemas['AuthSessionResponse'];

export const authService = {
  async register(payload: RegisterPayload): Promise<void> {
    return openApiRequest({
      path: '/api/auth/register',
      method: 'post',
      json: payload,
      requiresAuth: false,
    }).then(() => undefined);
  },

  async login(email: string, password: string): Promise<LoginResponse> {
    return openApiRequest({
      path: '/api/auth/login',
      method: 'post',
      json: { email, password },
      requiresAuth: false,
    });
  },

  async refresh(refreshToken: string): Promise<LoginResponse> {
    return openApiRequest({
      path: '/api/auth/refresh',
      method: 'post',
      json: { refreshToken },
      requiresAuth: false,
    });
  },

  async me(opts?: { signal?: AbortSignal }): Promise<AuthMeResponse> {
    return openApiRequest({
      path: '/api/auth/me',
      method: 'get',
      signal: opts?.signal,
    });
  },

  async logout(refreshToken?: string | null): Promise<AuthLogoutResponse> {
    const response = await openApiRequest({
      path: '/api/auth/logout',
      method: 'post',
      json: { refreshToken: refreshToken ?? undefined },
      requiresAuth: false,
    });

    clearAccessToken();

    return response;
  },

  async socialLogin(
    provider: SocialLoginPayload['provider'],
    idToken: string,
    nonce?: string,
  ): Promise<LoginResponse> {
    return openApiRequest({
      path: '/api/auth/social-login',
      method: 'post',
      json: nonce ? { provider, idToken, nonce } : { provider, idToken },
      requiresAuth: false,
    });
  },

  async requestSocialNonce(): Promise<{ nonce: string }> {
    return openApiRequest({
      path: '/api/auth/social-nonce',
      method: 'post',
      requiresAuth: false,
    });
  },

  async redeemSocialCode(code: string): Promise<LoginResponse> {
    return openApiRequest({
      path: '/api/auth/social-redeem',
      method: 'post',
      json: { code },
      requiresAuth: false,
    });
  },

  async completeOnboarding(): Promise<void> {
    return openApiRequest({
      path: '/api/auth/onboarding-complete',
      method: 'patch',
    }).then(() => undefined);
  },

  async deleteAccount(): Promise<DeleteAccountResponse> {
    return openApiRequest({
      path: '/api/auth/account',
      method: 'delete',
    });
  },

  async forgotPassword(
    email: string,
  ): Promise<OpenApiResponseFor<'/api/auth/forgot-password', 'post'>> {
    return openApiRequest({
      path: '/api/auth/forgot-password',
      method: 'post',
      json: { email },
      requiresAuth: false,
    });
  },

  async verifyEmail(token: string): Promise<OpenApiResponseFor<'/api/auth/verify-email', 'post'>> {
    return openApiRequest({
      path: '/api/auth/verify-email',
      method: 'post',
      json: { token },
      requiresAuth: false,
    });
  },

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<OpenApiResponseFor<'/api/auth/reset-password', 'post'>> {
    return openApiRequest({
      path: '/api/auth/reset-password',
      method: 'post',
      json: { token, newPassword },
      requiresAuth: false,
    });
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return openApiRequest({
      path: '/api/auth/change-password',
      method: 'put',
      json: { currentPassword, newPassword },
    }).then(() => undefined);
  },

  async changeEmail(
    newEmail: string,
    currentPassword: string,
  ): Promise<OpenApiResponseFor<'/api/auth/change-email', 'put'>> {
    return openApiRequest({
      path: '/api/auth/change-email',
      method: 'put',
      json: { newEmail, currentPassword },
    });
  },

  async confirmEmailChange(
    token: string,
  ): Promise<OpenApiResponseFor<'/api/auth/confirm-email-change', 'post'>> {
    return openApiRequest({
      path: '/api/auth/confirm-email-change',
      method: 'post',
      json: { token },
      requiresAuth: false,
    });
  },

  async exportData(): Promise<OpenApiResponseFor<'/api/users/me/export', 'get'>> {
    return openApiRequest({
      path: '/api/users/me/export',
      method: 'get',
    });
  },

  async updateTtsVoice(voice: TtsVoice | null): Promise<UpdateTtsVoiceResponse> {
    return openApiRequest({
      path: '/api/auth/tts-voice',
      method: 'patch',
      json: { voice },
    });
  },
};
