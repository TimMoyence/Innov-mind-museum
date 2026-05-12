import { describe, it, expect } from '@jest/globals';

import {
  registerSchema,
  forgotPasswordSchema,
  changeEmailSchema,
} from '@modules/auth/adapters/primary/http/schemas/auth.schemas';
import { SUPPORTED_LOCALES } from '@shared/i18n/locale';

// P0-5 — `SUPPORTED_LOCALES` diverges across apps. The mobile (FE) app ships
// 8 user locales including 'ar' (see museum-frontend/shared/config/supportedLocales.ts),
// but the BE Zod auth schemas hard-code `z.enum(['fr', 'en'])` on the three
// user-facing locale fields. An Arabic-speaking visitor who signs up, requests
// a password reset, or changes their email therefore receives an HTTP 400
// silently. The BE `SUPPORTED_LOCALES` itself only has 7 entries (no 'ar').
//
// We hard-code the expected FE set inline rather than importing it: museum-backend
// and museum-frontend live under separate tsconfigs and the FE module path is
// not reachable from the BE jest config.
const FE_SUPPORTED_LOCALES = ['en', 'fr', 'es', 'de', 'it', 'ja', 'zh', 'ar'] as const;

describe('P0-5 — auth locale enums coherence', () => {
  it('BE SUPPORTED_LOCALES must include every FE user locale', () => {
    for (const fe of FE_SUPPORTED_LOCALES) {
      expect(SUPPORTED_LOCALES).toContain(fe);
    }
  });

  for (const locale of FE_SUPPORTED_LOCALES) {
    it(`registerSchema must accept locale '${locale}'`, () => {
      const result = registerSchema.safeParse({
        email: 'test@example.com',
        password: 'password123',
        locale,
      });
      expect(result.success).toBe(true);
    });

    it(`forgotPasswordSchema must accept locale '${locale}'`, () => {
      const result = forgotPasswordSchema.safeParse({
        email: 'test@example.com',
        locale,
      });
      expect(result.success).toBe(true);
    });

    it(`changeEmailSchema must accept locale '${locale}'`, () => {
      const result = changeEmailSchema.safeParse({
        newEmail: 'new@example.com',
        currentPassword: 'pw',
        locale,
      });
      expect(result.success).toBe(true);
    });
  }
});
