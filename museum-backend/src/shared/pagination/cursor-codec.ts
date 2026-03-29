import type { ZodType } from 'zod';

/**
 * Generic cursor codec for cursor-based pagination.
 * Encodes/decodes a typed cursor value to/from a Base64URL string.
 */
export class CursorCodec<T> {
  constructor(private readonly schema: ZodType<T>) {}

  /** Encodes a cursor value to a Base64URL string. */
  encode(value: T): string {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  }

  /** Decodes a Base64URL cursor string, returning null if invalid or malformed. */
  decode(cursor: string): T | null {
    try {
      const json: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      const result = this.schema.safeParse(json);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }
}
