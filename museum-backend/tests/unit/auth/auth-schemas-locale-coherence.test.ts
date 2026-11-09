import {
  registerSchema,
  forgotPasswordSchema,
  changeEmailSchema,
} from '@modules/auth/adapters/primary/http/schemas/auth.schemas';
import { SUPPORTED_LOCALES } from '@shared/i18n/locale';

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
        dateOfBirth: '1990-06-13',
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
