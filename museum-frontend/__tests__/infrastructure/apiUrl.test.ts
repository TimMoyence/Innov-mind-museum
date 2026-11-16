jest.mock('expo-constants', () => ({
  expoConfig: { extra: { API_BASE_URL: 'https://stamped.example' } },
}));

import { apiUrl } from '@/shared/infrastructure/apiConfig';

describe('API-URL', () => {
  it('API-URL · un chemin d’API devient une URL absolue sur l’URL inscrite au build', () => {
    expect(apiUrl('/api/telemetry/funnel')).toBe('https://stamped.example/api/telemetry/funnel');
    expect(apiUrl('/api/auth/google/initiate?platform=mobile')).toBe(
      'https://stamped.example/api/auth/google/initiate?platform=mobile',
    );
  });

  it('API-URL · un chemin vide rend l’URL de base telle quelle', () => {
    expect(apiUrl('')).toBe('https://stamped.example');
  });
});
