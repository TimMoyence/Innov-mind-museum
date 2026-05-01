import { z } from 'zod';

/**
 * Permissive JSONB schema for fields that intentionally hold arbitrary
 * key-value pairs (audit metadata, generic config, etc.).
 *
 * Refuses: primitives (string, number, boolean), arrays, null when the
 * column is non-nullable. Accepts: any object whose keys are strings and
 * whose values are arbitrary JSON.
 */
export const LooseRecordSchema = z.record(z.string(), z.unknown());
/**
 *
 */
export type LooseRecord = z.infer<typeof LooseRecordSchema>;
