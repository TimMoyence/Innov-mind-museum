import { z } from 'zod';

import { parseDateOfBirth } from '@/shared/lib/dateOfBirth';

/**
 * Shared Zod schema and form-value type for the auth screen's react-hook-form
 * binding. Register-only fields (firstname, lastname, gdprAccepted) are optional
 * here because login mode does not require them; `useEmailPasswordAuth` enforces
 * presence at submit time. Date-of-birth is accepted in YYYY-MM-DD or any of
 * the locale-friendly formats `parseDateOfBirth` supports — server re-validates
 * and computes age against CNIL Délibération 2021-018 (15 yrs).
 */
export const authSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
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

export type AuthFormValues = z.infer<typeof authSchema>;

/** Stable empty-defaults object — usable as `defaultValues` and as the shape passed to `reset()`. */
export const AUTH_FORM_DEFAULTS: AuthFormValues = {
  email: '',
  password: '',
  firstname: '',
  lastname: '',
  gdprAccepted: false,
  dateOfBirth: '',
};
