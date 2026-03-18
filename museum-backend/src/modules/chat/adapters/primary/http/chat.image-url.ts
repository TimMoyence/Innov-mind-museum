import crypto from 'crypto';

import { env } from '@src/config/env';

const toBase64Url = (value: Buffer | string): string => {
  return Buffer.from(value).toString('base64url');
};

const signPayload = (payload: string): string => {
  return crypto
    .createHmac('sha256', env.storage.signingSecret)
    .update(payload)
    .digest('base64url');
};

/**
 * Generates a signed URL for reading a chat message image via the local image endpoint.
 * @param params - Base URL, message ID, and optional TTL in seconds.
 * @returns The signed URL and its ISO-8601 expiry timestamp.
 */
export const buildSignedChatImageReadUrl = (params: {
  baseUrl: string;
  messageId: string;
  ttlSeconds?: number;
}): { url: string; expiresAt: string } => {
  const ttlSeconds = Math.max(30, params.ttlSeconds ?? env.storage.signedUrlTtlSeconds);
  const expiresAtMs = Date.now() + ttlSeconds * 1000;
  const expiresAt = new Date(expiresAtMs).toISOString();
  const payload = `${params.messageId}.${expiresAtMs}`;
  const signature = signPayload(payload);
  const token = toBase64Url(payload);
  const url = new URL(`/api/chat/messages/${params.messageId}/image`, params.baseUrl);
  url.searchParams.set('token', token);
  url.searchParams.set('sig', signature);

  return {
    url: url.toString(),
    expiresAt,
  };
};

/**
 * Verifies the HMAC signature and expiry of a signed chat image URL.
 * @param params - Message ID, token, and signature from the query string.
 * @returns `{ ok: true, expiresAtMs }` on success, or `{ ok: false, reason }` on failure.
 */
export const verifySignedChatImageReadUrl = (params: {
  messageId: string;
  token?: string;
  signature?: string;
}): { ok: true; expiresAtMs: number } | { ok: false; reason: string } => {
  const token = params.token?.trim();
  const signature = params.signature?.trim();
  if (!token || !signature) {
    return { ok: false, reason: 'Missing token or signature' };
  }

  let decoded: string;
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf8');
  } catch {
    return { ok: false, reason: 'Invalid token encoding' };
  }

  const [messageId, expiresAtRaw] = decoded.split('.');
  if (!messageId || !expiresAtRaw || messageId !== params.messageId) {
    return { ok: false, reason: 'Invalid token payload' };
  }

  const expectedSignature = signPayload(decoded);
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    sigBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
  ) {
    return { ok: false, reason: 'Invalid signature' };
  }

  const expiresAtMs = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAtMs)) {
    return { ok: false, reason: 'Invalid expiry' };
  }

  if (Date.now() > expiresAtMs) {
    return { ok: false, reason: 'URL expired' };
  }

  return { ok: true, expiresAtMs };
};

