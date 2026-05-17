import { AppError } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';

import type { ValueTransformer } from 'typeorm';
import type { z } from 'zod';

/**
 * TypeORM transformer that runs Zod `.safeParse()` on every write. Invalid
 * writes throw `AppError(422)` with `details.field` + `details.issues[]`.
 * Reads are identity — stale rows tolerated; consumers handle at use-case
 * layer if strict reads needed.
 *
 * Example: `transformer: jsonbValidator(OpeningHoursSchema, 'museum_enrichment.openingHours')`
 * Convention: `<table>.<column>` for grep-ability in logs.
 */
export function jsonbValidator(schema: z.ZodType, fieldName: string): ValueTransformer {
  return {
    to(value: unknown): unknown {
      if (value === null || value === undefined) return value;
      const result = schema.safeParse(value);
      if (result.success) {
        return result.data;
      }
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      logger.warn('jsonb_validation_failed', { field: fieldName, issues });
      throw new AppError({
        message: `Invalid JSONB shape for ${fieldName}`,
        statusCode: 422,
        code: 'JSONB_VALIDATION',
        details: { field: fieldName, issues },
      });
    },
    from(value: unknown): unknown {
      return value;
    },
  };
}
