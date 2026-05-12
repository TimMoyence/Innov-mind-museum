import { z } from 'zod';

/** Minimum password length enforced by the backend AND surfaced in client UX. */
export const PASSWORD_MIN = 8;

/** Maximum password length — protects bcrypt against DoS via huge input. */
export const PASSWORD_MAX = 128;

/** Canonical Zod schema for password fields shared across BE + Web admin + Mobile. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Password must be at least ${String(PASSWORD_MIN)} characters`)
  .max(PASSWORD_MAX, `Password must be at most ${String(PASSWORD_MAX)} characters`);
