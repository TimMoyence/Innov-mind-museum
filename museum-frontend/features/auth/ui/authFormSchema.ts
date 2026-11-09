import { describeLimit, isEmail, isWithinLimit, TEXT_LIMITS } from '@musaium/shared/validation';
import { z } from 'zod';

import { parseDateOfBirth } from '@/shared/lib/dateOfBirth';

export const loginFormSchema = z.object({
  email: z.string().trim().refine(isEmail, { message: 'Invalid email address' }),
  password: z.string().min(1),
  firstname: z.string().optional(),
  lastname: z.string().optional(),
  gdprAccepted: z.boolean().optional(),
  dateOfBirth: z
    .string()
    .refine((raw) => raw === '' || parseDateOfBirth(raw) !== null, {
      message: 'YYYY-MM-DD or DD/MM/YYYY',
    })
    .optional(),
});

export const registerFormSchema = loginFormSchema.extend({
  password: z.string().refine((value) => isWithinLimit(value, TEXT_LIMITS.password), {
    message: describeLimit('Password', TEXT_LIMITS.password),
  }),
});

export type AuthFormValues = z.infer<typeof loginFormSchema>;

export const AUTH_FORM_DEFAULTS: AuthFormValues = {
  email: '',
  password: '',
  firstname: '',
  lastname: '',
  gdprAccepted: false,
  dateOfBirth: '',
};
