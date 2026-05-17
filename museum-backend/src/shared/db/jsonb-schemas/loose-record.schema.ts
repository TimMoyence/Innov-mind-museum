import { z } from 'zod';

/**
 * Permissive JSONB for arbitrary key-value pairs (audit metadata, etc.).
 * Refuses primitives, arrays, null (when column non-nullable). Accepts
 * any object {string: arbitrary JSON}.
 */
export const LooseRecordSchema = z.record(z.string(), z.unknown());
export type LooseRecord = z.infer<typeof LooseRecordSchema>;
