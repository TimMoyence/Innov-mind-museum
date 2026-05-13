import { z } from 'zod';
/** Minimum password length enforced by the backend AND surfaced in client UX. */
export declare const PASSWORD_MIN = 8;
/** Maximum password length — protects bcrypt against DoS via huge input. */
export declare const PASSWORD_MAX = 128;
/** Canonical Zod schema for password fields shared across BE + Web admin + Mobile. */
export declare const passwordSchema: z.ZodString;
