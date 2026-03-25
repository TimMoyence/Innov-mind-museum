import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { badRequest } from '@shared/errors/app.error';

/**
 * Express middleware factory that validates `req.body` against a Zod schema.
 * On success the parsed (and potentially transformed) data replaces `req.body`.
 * On failure a 400 `BAD_REQUEST` AppError is thrown.
 */
export function validateBody<T extends z.ZodType>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(', ');
      throw badRequest(message);
    }
    req.body = result.data;
    next();
  };
}
