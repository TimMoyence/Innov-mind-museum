import { z, type ZodType } from 'zod';

/** Decode buffer adapter — Node vs browser. Provided by the host to keep this package isomorphic. */
export type Base64UrlDecoder = (segment: string) => string;

/**
 * Cross-platform JWT-payload decoder. The host provides the base64url decoder
 * (`Buffer.from(s, 'base64url').toString('utf8')` in Node, `atob(s)` in the
 * browser/RN). On any failure — short token, JSON parse, schema mismatch —
 * the function returns `null`. NEVER use this for trust decisions; signature
 * verification must happen via `jsonwebtoken.verify(...)` elsewhere.
 */
export function decodeJwtPayloadWith<T>(
  token: string | undefined | null,
  schema: ZodType<T>,
  decode: Base64UrlDecoder,
): T | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const segment = parts[1];
    if (!segment) return null;
    const raw = JSON.parse(decode(segment)) as unknown;
    const result = schema.safeParse(raw);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Common schema for OIDC-style JWT headers (kid + alg). */
export const jwtHeaderSchema = z.object({
  kid: z.string().optional(),
  alg: z.string().optional(),
});

/** Common schema for Musaium-issued JWT payloads (id/sub + exp). */
export const baseJwtPayloadSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  sub: z.union([z.string(), z.number()]).optional(),
  exp: z.number().optional(),
});
