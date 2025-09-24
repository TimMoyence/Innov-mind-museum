const ensureLeadingSlash = (path: string): string => {
  if (!path.length) {
    return '/';
  }

  return path.startsWith('/') ? path : `/${path}`;
};

export const BASE_API_URL = 'http://localhost:3000';

const API_VERSION_PREFIX = '/api/v1';

export const AUTH_BASE_URL = `${BASE_API_URL}${API_VERSION_PREFIX}/auth`;

export const buildAuthUrl = (path: string): string => {
  if (path.startsWith('http')) {
    return path;
  }

  return `${AUTH_BASE_URL}${ensureLeadingSlash(path)}`;
};

export const buildApiUrl = (path: string): string => {
  if (path.startsWith('http')) {
    return path;
  }

  return `${BASE_API_URL}${API_VERSION_PREFIX}${ensureLeadingSlash(path)}`;
};

export const AUTH_ENDPOINTS = {
  login: '/login',
  register: '/register',
  logout: '/logout',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
} as const;

export const CONVERSATION_ENDPOINTS = {
  getById: (id: string) => `/conversation/${id}`,
  getAll: '/conversation/all',
  getByUser: (userId: string) => `/conversation/all/${userId}`,
} as const;

export const IA_ENDPOINTS = {
  museum: '/ia/museum',
  imageInsight: '/image-insight',
} as const;
