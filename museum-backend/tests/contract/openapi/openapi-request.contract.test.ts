import { assertMatchesOpenApiRequest } from 'tests/helpers/openapi/openapi-response-validator';

/**
 * Contract tests for REQUEST bodies against the OpenAPI spec.
 *
 * Mirror of `openapi-response.contract.test.ts` but exercises the
 * `requestBody.content.application/json.schema` path. The goal is to catch
 * drift between what routes actually validate (Zod schemas) and what the
 * OpenAPI spec promises to external consumers + the generated mobile types.
 *
 * These tests assert two things per endpoint:
 *   1. A canonical happy-path body matches the declared schema.
 *   2. A body missing `required` fields fails validation with a helpful error.
 */

describe('openapi request contracts (active API)', () => {
  describe('auth', () => {
    it('POST /auth/register — canonical body matches', () => {
      assertMatchesOpenApiRequest({
        path: '/api/auth/register',
        method: 'post',
        body: {
          email: 'new@test.com',
          password: 'Sup3rStr0ngP@ss',
          firstname: 'Ada',
          lastname: 'Lovelace',
          // A2: dateOfBirth is now a required field on the register schema (CNIL age gate).
          dateOfBirth: '1990-06-13',
        },
      });
    });

    it('POST /auth/register — missing email fails validation', () => {
      expect(() =>
        assertMatchesOpenApiRequest({
          path: '/api/auth/register',
          method: 'post',
          body: { password: 'x' } as unknown,
        }),
      ).toThrow(/OpenAPI request validation failed/);
    });

    it('POST /auth/login — canonical body matches', () => {
      assertMatchesOpenApiRequest({
        path: '/api/auth/login',
        method: 'post',
        body: { email: 'user@example.com', password: 'hunter2' },
      });
    });

    it('POST /auth/refresh — canonical body matches', () => {
      assertMatchesOpenApiRequest({
        path: '/api/auth/refresh',
        method: 'post',
        body: { refreshToken: 'rt-123' },
      });
    });

    it('POST /auth/forgot-password — canonical body matches', () => {
      assertMatchesOpenApiRequest({
        path: '/api/auth/forgot-password',
        method: 'post',
        body: { email: 'user@example.com' },
      });
    });

    it('POST /auth/reset-password — canonical body matches', () => {
      assertMatchesOpenApiRequest({
        path: '/api/auth/reset-password',
        method: 'post',
        body: { token: 'reset-token', newPassword: 'NewStr0ngPass!' },
      });
    });
  });

  // T-API-5 (RED — S-BE-API drift fix R18 + attribution R23).
  // Baseline FAILS: OpenAPI POST /api/reviews still lists `userName` in
  // `required` (openapi.json:4457) — so a body WITHOUT `userName` fails the
  // contract (assertion-fail), and a body WITH `sessionId` is currently not
  // declared. After green (T-API-11) drops `userName` from required + adds
  // optional `sessionId`, both assertions hold.
  describe('reviews (drift fix)', () => {
    it('POST /reviews — body {rating, comment} (NO userName) matches the contract (R18)', () => {
      assertMatchesOpenApiRequest({
        path: '/api/reviews',
        method: 'post',
        body: {
          rating: 9,
          comment: 'A sufficiently long review comment for the NPS scale.',
        },
      });
    });

    it('POST /reviews — body with optional sessionId matches the contract (R23)', () => {
      assertMatchesOpenApiRequest({
        path: '/api/reviews',
        method: 'post',
        body: {
          rating: 8,
          comment: 'A sufficiently long review comment for the NPS scale.',
          sessionId: '11111111-1111-4111-8111-111111111111',
        },
      });
    });

    it('POST /reviews — missing rating still fails validation', () => {
      expect(() =>
        assertMatchesOpenApiRequest({
          path: '/api/reviews',
          method: 'post',
          body: { comment: 'A sufficiently long review comment.' } as unknown,
        }),
      ).toThrow(/OpenAPI request validation failed/);
    });
  });

  describe('chat', () => {
    it('POST /chat/sessions — empty body is valid (all fields optional)', () => {
      assertMatchesOpenApiRequest({
        path: '/api/chat/sessions',
        method: 'post',
        body: {},
      });
    });

    it('POST /chat/sessions — full body matches', () => {
      assertMatchesOpenApiRequest({
        path: '/api/chat/sessions',
        method: 'post',
        body: {
          locale: 'fr',
          museumMode: true,
          museumId: 7,
          museumName: 'Louvre',
          museumAddress: 'Rue de Rivoli, Paris',
          coordinates: { lat: 48.86, lng: 2.33 },
        },
      });
    });
  });
});
