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
import { AppError } from '@shared/errors/app.error';

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const TOKEN_EXCHANGE_TIMEOUT_MS = 5_000;

/**
 *
 */
export interface GoogleTokenExchangeParams {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface GoogleTokenResponse {
  id_token?: string;
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

/**
 * Exchange the authorization code for an ID token. Returns just the
 * `id_token` since that is all SocialLoginUseCase needs. Throws an
 * AppError 401 on any error so the route handler can short-circuit.
 */
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

  const json = (await response.json()) as GoogleTokenResponse;
  if (typeof json.id_token !== 'string' || json.id_token.length === 0) {
    throw new AppError({
      message: 'Google token response missing id_token',
      statusCode: 502,
      code: 'GOOGLE_TOKEN_EXCHANGE_MALFORMED',
    });
  }
  return json.id_token;
}
