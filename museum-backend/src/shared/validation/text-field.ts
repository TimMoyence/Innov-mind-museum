import { describeLimit, isWithinLimit, type TextLimit } from '@musaium/shared';
import { z } from 'zod';

export function textField(limit: TextLimit, options: { trim?: boolean } = {}) {
  const base = options.trim ? z.string().trim() : z.string();
  return base
    .refine((value) => isWithinLimit(value, limit), { message: describeLimit('Value', limit) })
    .meta(limit.min ? { minLength: limit.min, maxLength: limit.max } : { maxLength: limit.max });
}
