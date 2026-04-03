jest.mock('expo-constants', () => ({
  expoConfig: { extra: {} },
}));

import {
  isLocalhostApiBaseUrl,
  buildApiUrl,
  buildHealthUrl,
  getStartupConfigurationError,
} from '@/shared/infrastructure/apiConfig';

describe('isLocalhostApiBaseUrl', () => {
  it('returns true for localhost URL', () => {
    expect(isLocalhostApiBaseUrl('http://localhost:3000')).toBe(true);
  });

  it('returns true for 127.0.0.1', () => {
    expect(isLocalhostApiBaseUrl('http://127.0.0.1:3000')).toBe(true);
  });

  it('returns true for ::1', () => {
    expect(isLocalhostApiBaseUrl('http://[::1]:3000')).toBe(true);
  });

  it('returns false for remote URL', () => {
    expect(isLocalhostApiBaseUrl('https://api.musaium.com')).toBe(false);
  });

  it('handles invalid URL by falling back to string check', () => {
    expect(isLocalhostApiBaseUrl('not-a-url-localhost')).toBe(true);
    expect(isLocalhostApiBaseUrl('not-a-url-remote')).toBe(false);
  });
});

describe('buildApiUrl', () => {
  it('concatenates base URL and path', () => {
    expect(buildApiUrl('https://api.test.com', '/api/health')).toBe(
      'https://api.test.com/api/health',
    );
  });

  it('strips trailing slashes from base URL', () => {
    expect(buildApiUrl('https://api.test.com/', '/api/health')).toBe(
      'https://api.test.com/api/health',
    );
  });

  it('adds leading slash to path if missing', () => {
    expect(buildApiUrl('https://api.test.com', 'api/health')).toBe(
      'https://api.test.com/api/health',
    );
  });

  it('handles empty path', () => {
    expect(buildApiUrl('https://api.test.com', '')).toBe('https://api.test.com/');
  });
});

describe('buildHealthUrl', () => {
  it('builds the health endpoint URL', () => {
    expect(buildHealthUrl('https://api.test.com')).toBe('https://api.test.com/api/health');
  });
});

describe('getStartupConfigurationError', () => {
  it('returns null when configuration is valid (development mode)', () => {
    const error = getStartupConfigurationError();
    expect(error).toBeNull();
  });
});
