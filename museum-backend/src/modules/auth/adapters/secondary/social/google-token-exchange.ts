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

const GoogleTokenResponseSchema = z.object({
  id_token: z.string().min(1),
  access_token: z.string().optional(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

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
    throw new AppError({
      message: 'Google token response failed shape validation',
      statusCode: 502,
      code: 'GOOGLE_TOKEN_EXCHANGE_MALFORMED',
      details: { issues: parsed.error.issues },
    });
  }
  return parsed.data.id_token;
}
