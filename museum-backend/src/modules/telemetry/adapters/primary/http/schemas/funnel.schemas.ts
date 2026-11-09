import { z } from 'zod';

import { textField } from '@shared/validation/text-field';

const propsValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const funnelEventSchema = z.object({
  name: textField({ min: 1, max: 200 }, { trim: true }),
  url: textField({ min: 1, max: 2000 }, { trim: true }),
  domain: textField({ min: 1, max: 253 }, { trim: true }),
  referrer: textField({ max: 2000 }, { trim: true }).optional(),
  props: z.record(z.string().min(1).max(80), propsValueSchema).optional(),
});

export type FunnelEventInput = z.infer<typeof funnelEventSchema>;
