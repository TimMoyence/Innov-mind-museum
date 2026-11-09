import { TEXT_LIMITS } from '@musaium/shared';
import { z } from 'zod';

import { CONTENT_PREFERENCES } from '@modules/auth/domain/consent/content-preference';
import { TTS_VOICES } from '@modules/chat/domain/voice-catalog';
import { SUPPORTED_LOCALES } from '@shared/i18n/locale';
import { emailField } from '@shared/validation/email-field';
import { textField } from '@shared/validation/text-field';

export const registerSchema = z.object({
  email: emailField,
  password: textField(TEXT_LIMITS.password),
  firstname: textField(TEXT_LIMITS.personName).optional(),
  lastname: textField(TEXT_LIMITS.personName).optional(),
  locale: z.enum(SUPPORTED_LOCALES as readonly [string, ...string[]]).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be YYYY-MM-DD'),
});

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const socialLoginSchema = z.object({
  provider: z.enum(['apple', 'google']),
  idToken: z.string().min(1),
  nonce: z.string().min(16).max(256).optional(),
});

export const socialRedeemSchema = z.object({
  code: z
    .string()
    .min(22)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, 'Code must be base64url'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: textField(TEXT_LIMITS.password),
});

export const forgotPasswordSchema = z.object({
  email: emailField,
  locale: z.enum(SUPPORTED_LOCALES as readonly [string, ...string[]]).optional(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: textField(TEXT_LIMITS.password),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const changeEmailSchema = z.object({
  newEmail: emailField,
  currentPassword: z.string().min(1),
  locale: z.enum(SUPPORTED_LOCALES as readonly [string, ...string[]]).optional(),
});

export const confirmEmailChangeSchema = z.object({
  token: z.string().min(1),
});

export const updateContentPreferencesSchema = z.object({
  preferences: z
    .array(z.enum(CONTENT_PREFERENCES as readonly [string, ...string[]]))
    .max(CONTENT_PREFERENCES.length),
});

export const updateTtsVoiceSchema = z.object({
  voice: z.enum(TTS_VOICES).nullable(),
});

export const updateProfilePreferencesSchema = z
  .object({
    defaultMuseumMode: z.boolean().optional(),
    guideLevel: z.enum(['beginner', 'intermediate', 'expert']).optional(),
    dataMode: z.enum(['auto', 'low', 'normal']).optional(),
    audioDescriptionMode: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one preference field is required',
  });
