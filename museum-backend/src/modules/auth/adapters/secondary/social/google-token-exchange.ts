/**
 * F11 (2026-05) — Google authorization-code exchange.
 *
 * POSTs the code received on /callback to Google's token endpoint with the
 * registered web client_id + client_secret + redirect_uri, and parses the
 * resulting `id_token`. Signature/audience/nonce verification of that
 * id_token is delegated to {@link SocialLoginUseCase} which already runs
 * the JWKS check via the social-token-verifier port (defence-in-depth: the
 * exchange itself authenticates Google as the issuer via the TLS handshake,
 * but the ID token still goes through the canonical JWKS verification).
 */
import { z } from 'zod';

import { AppError } from '@shared/errors/app.error';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const TOKEN_EXCHANGE_TIMEOUT_MS = 5_000;

export interface GoogleTokenExchangeParams {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/**
 * Runtime shape contract for Google's `/token` endpoint response (P0-8).
 *
 * Closes the silent-cast gap audited in
 * `docs/audit-2026-05-12/details/01-typing.md §P1-1` — replacing the bare
 * `as GoogleTokenResponse` cast at the json() call site so external API
 * drift (added required fields, wrong types, error envelopes) surfaces as
 * a typed AppError with the failing field name in `details.issues` rather
 * than as a deep TypeError or undetected contract breach downstream.
 *
 * `id_token` is required because every code path that consumes this
 * response forwards it; the other fields are kept optional to match Google's
 * actual variable response shape.
 */
const GoogleTokenResponseSchema = z.object({
  id_token: z.string().min(1),
  access_token: z.string().optional(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

/** Throws AppError 401 on any error so the route handler can short-circuit. */
export async function exchangeGoogleAuthCode(params: GoogleTokenExchangeParams): Promise<string> {
  const body = new URLSearchParams({
    code: params.code,
    client_id: params.clientId,
    client_secret: params.clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: 'authorization_code',
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, TOKEN_EXCHANGE_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: controller.signal,
    });
  } catch {
    throw new AppError({
      message: 'Google token exchange network error',
      statusCode: 502,
      code: 'GOOGLE_TOKEN_EXCHANGE_FAILED',
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new AppError({
      message: `Google token exchange rejected (${String(response.status)})`,
      statusCode: 401,
      code: 'GOOGLE_TOKEN_EXCHANGE_REJECTED',
    });
  }

  const raw: unknown = await response.json();
  const parsed = GoogleTokenResponseSchema.safeParse(raw);
  if (!parsed.success) {
    // P0-8: surface Zod issues so ops can distinguish "missing id_token"
    // from "id_token wrong type" from "expires_in wrong type" at a glance.
    throw new AppError({
      message: 'Google token response failed shape validation',
      statusCode: 502,
      code: 'GOOGLE_TOKEN_EXCHANGE_MALFORMED',
      details: { issues: parsed.error.issues },
    });
  }
  return parsed.data.id_token;
}
