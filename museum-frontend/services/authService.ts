import { httpRequest } from './http';
import { AUTH_ENDPOINTS, buildAuthUrl } from './apiConfig';
import { clearAccessToken, setAccessToken } from './tokenStore';

export interface RegisterPayload {
  email: string;
  password: string;
  firstname: string;
  lastname: string;
}

export interface LoginResponse {
  token?: string;
  [key: string]: unknown;
}

export const authService = {
  async register(payload: RegisterPayload): Promise<unknown> {
    return httpRequest<unknown>(buildAuthUrl(AUTH_ENDPOINTS.register), {
      method: 'POST',
      body: JSON.stringify(payload),
      requiresAuth: false,
    });
  },

  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await httpRequest<LoginResponse>(
      buildAuthUrl(AUTH_ENDPOINTS.login),
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        requiresAuth: false,
      },
    );

    if (response?.token) {
      setAccessToken(response.token);
    }

    return response;
  },

  async logout(): Promise<unknown> {
    const response = await httpRequest<unknown>(
      buildAuthUrl(AUTH_ENDPOINTS.logout),
      {
        method: 'POST',
      },
    );

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
