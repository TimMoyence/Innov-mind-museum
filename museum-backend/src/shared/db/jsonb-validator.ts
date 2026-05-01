import { AppError } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';

import type { ValueTransformer } from 'typeorm';
import type { ZodSchema } from 'zod';

/**
 * Builds a TypeORM column transformer that runs the supplied Zod schema's
 * `.safeParse()` on every write (`to` direction). Invalid writes throw an
 * `AppError(422)` with `details.field` and `details.issues[]` so the global
 * error middleware can surface a structured 422 response. Reads (`from`) are
 * identity — stale rows in the DB are tolerated; consumers handle them at
 * the use case layer if strict reads are needed.
 *
 * Use as the `transformer` option on a TypeORM `jsonb` column decorator.
 * Pass the schema and a `<table>.<column>` field name identifier.
 * Example: `transformer: jsonbValidator(OpeningHoursSchema, 'museum_enrichment.openingHours')`
 *
 * The fieldName argument is used in log lines and error details — use the
 * `<table>.<column>` convention for grep-ability across logs.
 */
export function jsonbValidator(schema: ZodSchema, fieldName: string): ValueTransformer {
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
