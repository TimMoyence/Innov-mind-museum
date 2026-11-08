import { EMAIL_MAX_LENGTH, isEmail } from '@musaium/shared';
import { z } from 'zod';

export const emailField = z
  .string()
  .trim()
  .refine(isEmail, { message: 'Invalid email address' })
  .meta({ maxLength: EMAIL_MAX_LENGTH });
