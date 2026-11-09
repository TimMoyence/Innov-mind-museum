import { invalidInput } from '@shared/errors/app.error';
import { formatZodIssues } from '@shared/validation/zod-issue.formatter';

import type { Request, Response, NextFunction } from 'express';
import type { z } from 'zod';

export function validateQuery(schema: z.ZodType) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      throw invalidInput(formatZodIssues(result.error.issues));
    }
    res.locals.validatedQuery = result.data;
    next();
  };
}
