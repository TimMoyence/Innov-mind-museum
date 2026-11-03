jest.mock('expo-constants', () => ({
  expoConfig: { extra: { API_BASE_URL: 'https://stamped.example' } },
}));

import * as apiUrlConfig from '../../api-url.config';
import { resolveInitialApiBaseUrl } from '@/shared/infrastructure/apiConfig';

const LOCAL = 'http://localhost:3000';
const PROD = 'https://musaium.com';

type BuildEnv = Parameters<typeof apiUrlConfig.resolveVariant>[0];

const urlFor = (env: BuildEnv): string =>
  apiUrlConfig.resolveApiBaseUrl(apiUrlConfig.resolveVariant(env), env);

describe('RAZ-M14-API-URL', () => {
  it('RAZ-M14-API-URL · un build de développement vise le backend local par défaut', () => {
    expect(urlFor({})).toBe(LOCAL);
    expect(urlFor({ CONFIGURATION: 'Debug' })).toBe(LOCAL);
  });

  it('RAZ-M14-API-URL · un build de développement suit EXPO_PUBLIC_API_BASE_URL, sans slash final', () => {
    expect(
      urlFor({ APP_VARIANT: 'development', EXPO_PUBLIC_API_BASE_URL: 'http://10.0.2.2:3000/' }),
    ).toBe('http://10.0.2.2:3000');
  });

  it('RAZ-M14-API-URL · un placeholder EAS non substitué retombe sur le backend local', () => {
    expect(urlFor({ EXPO_PUBLIC_API_BASE_URL: '$EXPO_PUBLIC_API_BASE_URL' })).toBe(LOCAL);
  });

  it.each<BuildEnv>([
    { APP_VARIANT: 'preview', EXPO_PUBLIC_API_BASE_URL: LOCAL },
    { APP_VARIANT: 'production', EXPO_PUBLIC_API_BASE_URL: LOCAL },
    { EAS_BUILD_PROFILE: 'production' },
    { CONFIGURATION: 'Release', APP_VARIANT: 'development', EXPO_PUBLIC_API_BASE_URL: LOCAL },
  ])('RAZ-M14-API-URL · tout autre build vise la prod, quel que soit le .env (%o)', (env) => {
    expect(urlFor(env)).toBe(PROD);
  });

  it('RAZ-M14-API-URL · une seule règle : ni staging ni environnement d’API', () => {
    expect(Object.keys(apiUrlConfig).sort()).toEqual(['resolveApiBaseUrl', 'resolveVariant']);
  });

  it('RAZ-M14-API-URL · le runtime lit l’URL tamponnée au build', () => {
    expect(resolveInitialApiBaseUrl()).toBe('https://stamped.example');
  });
});
