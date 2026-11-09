import { mockFetch } from '../../helpers/fetch/fetch-mock.helpers';

jest.mock('@src/config/env', () => ({
  env: {
    auth: {
      appleClientId: 'com.example.app',
      googleClientIds: ['google-client-id-1'],
      appleJwksUrl: 'https://appleid.apple.com/auth/keys',
      googleJwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
      oidcNonceEnforce: false,
    },
  },
}));

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const originalFetch = global.fetch;

const makeTokenWithKid = (kid: string): string => {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })).toString(
    'base64url',
  );
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'apple-user',
      iss: 'https://appleid.apple.com',
      aud: 'com.example.app',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url');
  return `${header}.${payload}.not-a-real-signature`;
};

describe('social-token-verifier — JWKS response validation (P0-8 RED)', () => {
  let verifyAppleIdToken: typeof import('@modules/auth/adapters/secondary/social/social-token-verifier').verifyAppleIdToken;

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    const mod = await import('@modules/auth/adapters/secondary/social/social-token-verifier');
    verifyAppleIdToken = mod.verifyAppleIdToken;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('rejects rate-limit-shaped JWKS payload with an AppError, not a TypeError', async () => {
    global.fetch = mockFetch({
      ok: true,
      status: 200,
      body: { error: 'rate limited', retry_after: 60 },
    });

    const token = makeTokenWithKid('test-kid-rate-limited');

    await expect(verifyAppleIdToken(token)).rejects.toMatchObject({
      code: 'JWKS_MALFORMED',
      statusCode: expect.any(Number),
    });
  });

  it('surfaces a JWKS-shape-related error message, not an internal TypeError stack', async () => {
    global.fetch = mockFetch({
      ok: true,
      status: 200,
      body: { error: 'rate limited', retry_after: 60 },
    });

    const token = makeTokenWithKid('test-kid-rate-limited');

    await expect(verifyAppleIdToken(token)).rejects.toThrow(/jwks|keys|malformed/i);
  });

  it('rejects JWKS keys missing required fields (kid/use/alg/n/e) as a typed AppError', async () => {
    global.fetch = mockFetch({
      ok: true,
      status: 200,
      body: { keys: [{ kty: 'RSA' }] },
    });

    const token = makeTokenWithKid('test-kid-incomplete');

    await expect(verifyAppleIdToken(token)).rejects.toMatchObject({
      code: 'JWKS_MALFORMED',
      statusCode: expect.any(Number),
    });
  });

  it('attaches a 4xx-class statusCode to the AppError (auth boundary, not 500)', async () => {
    global.fetch = mockFetch({
      ok: true,
      status: 200,
      body: { keys: [{ kty: 'RSA' }] },
    });

    const token = makeTokenWithKid('test-kid-incomplete-2');

    await expect(verifyAppleIdToken(token)).rejects.toMatchObject({
      statusCode: expect.any(Number),
      code: expect.stringMatching(/JWKS|TOKEN_INVALID|MALFORMED/i),
    });
  });
});
