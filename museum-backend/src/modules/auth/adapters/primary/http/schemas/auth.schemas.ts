import { z } from 'zod';

import { CONTENT_PREFERENCES } from '@modules/auth/domain/consent/content-preference';
import { TTS_VOICES } from '@modules/chat/domain/voice-catalog';
import { SUPPORTED_LOCALES } from '@shared/i18n/locale';

export const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
  firstname: z.string().max(100).optional(),
  lastname: z.string().max(100).optional(),
  locale: z.enum(SUPPORTED_LOCALES as readonly [string, ...string[]]).optional(),
  // CNIL Délibération 2021-018 — digital majority 15y. Below → BE returns
  // MINOR_PARENTAL_CONSENT_REQUIRED. Use case parses + computes age server-side.
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateOfBirth must be YYYY-MM-DD')
    .optional(),
});

export const loginSchema = z.object({
  email: z.email(),
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
  // F3 — optional during mobile rollout; rejected when `OIDC_NONCE_ENFORCE=true`.
  // 16 chars floor (~96 bits), 256 ceiling for client-hashed variants (no DoS).
  nonce: z.string().min(16).max(256).optional(),
});

// F11-mobile — bounds match OTC issuer: 22 chars (16 raw bytes) to 64 (entropy headroom).
export const socialRedeemSchema = z.object({
  code: z
    .string()
    .min(22)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, 'Code must be base64url'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.email(),
  locale: z.enum(SUPPORTED_LOCALES as readonly [string, ...string[]]).optional(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const changeEmailSchema = z.object({
  newEmail: z.email(),
  currentPassword: z.string().min(1),
  locale: z.enum(SUPPORTED_LOCALES as readonly [string, ...string[]]).optional(),
});

export const confirmEmailChangeSchema = z.object({
  token: z.string().min(1),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.iso.datetime().optional(),
});

export const updateContentPreferencesSchema = z.object({
  preferences: z
    .array(z.enum(CONTENT_PREFERENCES as readonly [string, ...string[]]))
    .max(CONTENT_PREFERENCES.length),
});

// Spec C T2.4 — `null` resets to env default. Unknown voice / non-string / missing → 400.
export const updateTtsVoiceSchema = z.object({
  voice: z.enum(TTS_VOICES).nullable(),
});

// TD-2 — All fields optional; `.refine` blocks empty body. `defaultLocale`
// permissive 2..8 char (BCP-47-ish) — FE keeps canonical whitelist.
export const updateProfilePreferencesSchema = z
  .object({
    defaultLocale: z.string().min(2).max(8).optional(),
    defaultMuseumMode: z.boolean().optional(),
    guideLevel: z.enum(['beginner', 'intermediate', 'expert']).optional(),
    dataMode: z.enum(['auto', 'low', 'normal']).optional(),
    audioDescriptionMode: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one preference field is required',
  });
