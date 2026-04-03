import { badRequest } from '@shared/errors/app.error';

import type { Request, Response, NextFunction } from 'express';
import type { z } from 'zod';

/**
 * Express middleware factory that validates `req.query` against a Zod schema.
 * On success the parsed (and potentially coerced) data is stored in `res.locals.validatedQuery`.
 * On failure a 400 `BAD_REQUEST` AppError is thrown.
 *
 * Note: Express 5 makes `req.query` read-only, so we use `res.locals` instead.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function validateQuery<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(', ');
      throw badRequest(message);
    }
    res.locals.validatedQuery = result.data as z.infer<T>;
    next();
  };
}
