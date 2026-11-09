import type { ZodType } from 'zod';

export class CursorCodec<T> {
  constructor(private readonly schema: ZodType<T>) {}

  encode(value: T): string {
    return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  }

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
