import { AppError } from '@shared/errors/app.error';
import { exchangeGoogleAuthCode } from '@modules/auth/adapters/secondary/social/google-token-exchange';
import { mockFetch } from '../../helpers/fetch/fetch-mock.helpers';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const originalFetch = global.fetch;

const makeParams = (
  overrides: Partial<Parameters<typeof exchangeGoogleAuthCode>[0]> = {},
): Parameters<typeof exchangeGoogleAuthCode>[0] => ({
  code: 'auth-code-from-google',
  clientId: 'fake-client-id.apps.googleusercontent.com',
  clientSecret: 'fake-client-secret',
  redirectUri: 'https://example.com/callback',
  ...overrides,
});

describe('google-token-exchange — response shape validation (P0-8 RED)', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  it('reports `id_token` field name in error detail when id_token is absent', async () => {
    global.fetch = mockFetch({
      ok: true,
      status: 200,
      body: { error: 'invalid_grant', error_description: 'Bad Request' },
    });

    let caught: unknown;
    try {
      await exchangeGoogleAuthCode(makeParams());
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).details).toEqual(
      expect.objectContaining({
        issues: expect.arrayContaining([
          expect.objectContaining({
            path: expect.arrayContaining(['id_token']),
          }),
        ]),
      }),
    );
  });

  it('reports a type-mismatch issue when id_token is a number instead of a string', async () => {
    global.fetch = mockFetch({
      ok: true,
      status: 200,
      body: { id_token: 12345 },
    });

    let caught: unknown;
    try {
      await exchangeGoogleAuthCode(makeParams());
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).details).toEqual(
      expect.objectContaining({
        issues: expect.arrayContaining([
          expect.objectContaining({
            path: expect.arrayContaining(['id_token']),
          }),
        ]),
      }),
    );
  });

  it('rejects malformed expires_in (string instead of number) via runtime validation', async () => {
    global.fetch = mockFetch({
      ok: true,
      status: 200,
      body: {
        id_token: 'valid.jwt.value',
        expires_in: 'not-a-number',
        token_type: 'Bearer',
      },
    });

    await expect(exchangeGoogleAuthCode(makeParams())).rejects.toBeInstanceOf(AppError);
  });
});
