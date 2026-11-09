import { z } from 'zod';

export const LooseRecordSchema = z.record(z.string(), z.unknown());
export type LooseRecord = z.infer<typeof LooseRecordSchema>;
