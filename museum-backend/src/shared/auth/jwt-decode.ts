import { z, type ZodType } from 'zod';

/**
 * Decodes a JWT *without* verifying the signature, then validates the payload
 * against a Zod schema. Returns the parsed payload on success, or `null` on
 * any decode/validation failure.
 *
 * NEVER use the returned payload to make trust decisions — only `jsonwebtoken`'s
 * verified `jwt.verify(...)` may do that. This helper exists for opportunistic
 * payload reads (rate-limit key extraction, OIDC kid discovery, refresh-token
 * familyId extraction) where the signature is checked elsewhere or unverified
 * data is acceptable by design.
 */
export function decodeJwtPayload<T>(token: string | undefined, schema: ZodType<T>): T | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const raw = JSON.parse(json) as unknown;
    const result = schema.safeParse(raw);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Decodes JWT header WITHOUT verifying. Used by OIDC verifiers to discover `kid` for JWKS lookup before signature verification. */
export function decodeJwtHeader<T>(token: string, schema: ZodType<T>): T | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[0], 'base64url').toString('utf8');
    const raw = JSON.parse(json) as unknown;
    const result = schema.safeParse(raw);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Common Zod schema for the OIDC-style header carrying `kid` + `alg`. */
export const jwtHeaderSchema = z.object({
  kid: z.string().optional(),
  alg: z.string().optional(),
});
