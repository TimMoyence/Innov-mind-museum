import { httpRequest } from './http';
import { AUTH_ENDPOINTS, buildAuthUrl } from './apiConfig';
import { clearAccessToken } from './tokenStore';
import type { components, paths } from '@/shared/api/generated/openapi';
import {
  openApiRequest,
  type OpenApiJsonRequestBodyFor,
} from '@/shared/api/openapiClient';

type Schemas = components['schemas'];
type RegisterPayload = OpenApiJsonRequestBodyFor<'/api/auth/register', 'post'>;
type AuthMeResponse =
  paths['/api/auth/me']['get']['responses'][200]['content']['application/json'];
type AuthLogoutResponse =
  paths['/api/auth/logout']['post']['responses'][200]['content']['application/json'];

export type LoginResponse = Schemas['AuthSessionResponse'];

export const authService = {
  async register(payload: RegisterPayload): Promise<void> {
    return openApiRequest({
      path: '/api/auth/register',
      method: 'post',
      body: JSON.stringify(payload),
      requiresAuth: false,
    }).then(() => undefined);
  },

  async login(email: string, password: string): Promise<LoginResponse> {
    return openApiRequest({
      path: '/api/auth/login',
      method: 'post',
      body: JSON.stringify({ email, password }),
      requiresAuth: false,
    });
  },

  async refresh(refreshToken: string): Promise<LoginResponse> {
    return openApiRequest({
      path: '/api/auth/refresh',
      method: 'post',
      body: JSON.stringify({ refreshToken }),
      requiresAuth: false,
    });
  },

  async me(): Promise<AuthMeResponse> {
    return openApiRequest({
      path: '/api/auth/me',
      method: 'get',
    });
  },

  async logout(refreshToken?: string | null): Promise<AuthLogoutResponse> {
    const response = await openApiRequest({
      path: '/api/auth/logout',
      method: 'post',
      body: JSON.stringify({ refreshToken: refreshToken || undefined }),
      requiresAuth: false,
    });

    clearAccessToken();

    return response;
  },

  async forgotPassword(email: string): Promise<unknown> {
    return httpRequest<unknown>(buildAuthUrl(AUTH_ENDPOINTS.forgotPassword), {
      method: 'POST',
      body: JSON.stringify({ email }),
      requiresAuth: false,
    });
  },

  async resetPassword(token: string, newPassword: string): Promise<unknown> {
    return httpRequest<unknown>(buildAuthUrl(AUTH_ENDPOINTS.resetPassword), {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
      requiresAuth: false,
    });
  },
};

export type AuthService = typeof authService;
