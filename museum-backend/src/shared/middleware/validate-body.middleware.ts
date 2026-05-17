import { badRequest } from '@shared/errors/app.error';
import { formatZodIssues } from '@shared/validation/zod-issue.formatter';

import type { Request, Response, NextFunction } from 'express';
import type { z } from 'zod';

/**
 * Mutates `req.body` with the parsed/transformed result.
 *
 * @throws {Error} AppError 400 BAD_REQUEST (wire format via {@link formatZodIssues}).
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- generic T constrains the Zod schema and infers the output type
export function validateBody<T extends z.ZodType>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // `req.body` is `any` in @types/express; narrow to `unknown` so Zod's
    // typed `data` output flows through to the assignment.
    const result = schema.safeParse(req.body as unknown);
    if (!result.success) {
      throw badRequest(formatZodIssues(result.error.issues));
    }
    req.body = result.data as unknown;
    next();
  };
}
