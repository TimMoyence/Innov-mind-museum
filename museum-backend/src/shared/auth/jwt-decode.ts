import { z, type ZodType } from 'zod';

function decodeJwtSegment<T>(
  token: string | undefined,
  segment: 0 | 1,
  schema: ZodType<T>,
): T | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const raw = JSON.parse(Buffer.from(parts[segment], 'base64url').toString('utf8')) as unknown;
    const result = schema.safeParse(raw);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function decodeJwtPayload<T>(token: string | undefined, schema: ZodType<T>): T | null {
  return decodeJwtSegment(token, 1, schema);
}

export function decodeJwtHeader<T>(token: string, schema: ZodType<T>): T | null {
  return decodeJwtSegment(token, 0, schema);
}

export const jwtHeaderSchema = z.object({
  kid: z.string().optional(),
  alg: z.string().optional(),
});
