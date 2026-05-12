import { z, type ZodType } from 'zod';

/**
 * Decodes a JWT payload without verifying the signature, then validates against
 * a Zod schema. Returns `null` on any decode/parse/validation failure. Useful
 * for opportunistic reads (token expiry, userId) where unverified data is OK.
 *
 * Browser/RN-friendly: uses the global `atob` instead of Node's `Buffer`.
 */
export function decodeJwtPayload<T>(token: string | undefined | null, schema: ZodType<T>): T | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const segment = parts[1];
    if (!segment) return null;
    const raw = JSON.parse(atob(segment)) as unknown;
    const result = schema.safeParse(raw);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Schema common to JWT payloads issued by the Musaium backend. */
export const baseJwtPayloadSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  sub: z.union([z.string(), z.number()]).optional(),
  exp: z.number().optional(),
});
