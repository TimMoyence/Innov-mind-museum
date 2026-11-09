import { z, type ZodType } from 'zod';

export function decodeJwtPayload<T>(
  token: string | undefined | null,
  schema: ZodType<T>,
): T | null {
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

export const baseJwtPayloadSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  sub: z.union([z.string(), z.number()]).optional(),
  exp: z.number().optional(),
});
