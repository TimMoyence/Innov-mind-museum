/**
 * P0-8 RED — Google token-exchange response shape validation.
 *
 * Source: docs/audit-2026-05-12/details/01-typing.md §P1-1
 *
 * `google-token-exchange.ts:80` casts `response.json()` directly to
 * `GoogleTokenResponse` without runtime validation. The next line guards
 * `typeof json.id_token !== 'string'` — this catches outright-missing /
 * wrong-typed `id_token`, but:
 *   1. It throws a generic `GOOGLE_TOKEN_EXCHANGE_MALFORMED` without telling
 *      the operator WHICH field is malformed (today's error message: "Google
 *      token response missing id_token" — narrow and field-specific by luck,
 *      but if Google adds a new required field tomorrow we get nothing).
 *   2. It does NOT catch fields beyond `id_token` (e.g. `expires_in` typed
 *      as `string` instead of `number`). Scenario C below exercises that.
 *
 * RED phase: these tests assert that the validator (Zod safeParse, post-fix)
 * surfaces field-level detail for malformed responses, including detection
 * of unsoundly-typed `expires_in`. They MUST fail today because:
 *   - A & B fail because the error message / details don't reference the
 *     failing field by name (today's message says "missing id_token" by hand,
 *     not via a structured Zod issue).
 *   - C fails because the current cast accepts `expires_in: "not-a-number"`
 *     silently.
 */
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

  /**
   * Scenario A — Google returns 200 OK with `{ error: "invalid_grant" }`
   * (no `id_token` at all). Today's `typeof json.id_token !== 'string'`
   * catches this, but the error message ("Google token response missing
   * id_token") is hand-rolled and brittle.
   *
   * After fix (Zod): the AppError's `details` (or message) must reference
   * the failing field name `id_token` as part of a structured validation
   * issue — so operators reading logs can immediately distinguish
   * "missing id_token" from "id_token wrong type" from "expires_in wrong type".
   */
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
    // Headline RED assertion: the failing field name must be available in
    // either `details` (the Zod-style structured payload) OR the message.
    // Today the message is "Google token response missing id_token" (works
    // by luck for this scenario), but `details` is `undefined`. The fix
    // must populate `details` with the Zod issue array so structured
    // observability can read it.
    expect((caught as AppError).details).toEqual(
      expect.objectContaining({
        // Zod issues array contains an entry whose `path` includes 'id_token'.
        // We accept any shape that mentions the field name.
        issues: expect.arrayContaining([
          expect.objectContaining({
            path: expect.arrayContaining(['id_token']),
          }),
        ]),
      }),
    );
  });

  /**
   * Scenario B — Google returns 200 OK with `{ id_token: 12345 }` (number,
   * not string). Today's `typeof` check rejects this with the same generic
   * "missing id_token" message — operator can't tell from the log whether
   * the field was missing or had wrong type. After the fix, Zod's issue
   * should carry `expected: 'string'` / `received: 'number'` (or similar).
   */
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
    // Zod safeParse will produce an issue with `path: ['id_token']` and
    // a code like `invalid_type` indicating the expected/received types.
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

  /**
   * Scenario C — THE crucial Zod-only case. Google returns 200 OK with a
   * valid string `id_token` but `expires_in: "not-a-number"`.
   *
   * Today: cast accepts it. The function returns `json.id_token` and
   * downstream code receives a `GoogleTokenResponse` where `expires_in` is
   * a string masquerading as a number. The TypeScript type system has been
   * lied to. Nothing crashes here because the function only forwards
   * `id_token`, but the contract is broken.
   *
   * After fix: Zod must reject this and throw an AppError before returning.
   * If/when a downstream caller starts using `expires_in`, the trust is
   * already grounded in runtime validation.
   */
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

    // Today this resolves successfully — the cast accepts a string for
    // `expires_in` despite the TypeScript interface declaring `number`.
    // After the fix, Zod safeParse must reject the response.
    await expect(exchangeGoogleAuthCode(makeParams())).rejects.toBeInstanceOf(AppError);
  });
});
