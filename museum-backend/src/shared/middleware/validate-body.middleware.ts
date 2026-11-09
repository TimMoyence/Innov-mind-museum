import { invalidInput } from '@shared/errors/app.error';
import { formatZodIssues } from '@shared/validation/zod-issue.formatter';

import type { Request, Response, NextFunction } from 'express';
import type { z } from 'zod';

export function validateBody(schema: z.ZodType) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body as unknown);
    if (!result.success) {
      throw invalidInput(formatZodIssues(result.error.issues));
    }
    req.body = result.data;
    next();
  };
}
