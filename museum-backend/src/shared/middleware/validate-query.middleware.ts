import { badRequest } from '@shared/errors/app.error';
import { formatZodIssues } from '@shared/validation/zod-issue.formatter';

import type { Request, Response, NextFunction } from 'express';
import type { z } from 'zod';

/**
 * Parsed data → `res.locals.validatedQuery` (Express 5 made `req.query` read-only).
 *
 * @throws {Error} AppError 400 BAD_REQUEST on validation failure.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- generic T constrains the Zod schema and infers the output type
export function validateQuery<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      throw badRequest(formatZodIssues(result.error.issues));
    }
    res.locals.validatedQuery = result.data;
    next();
  };
}
