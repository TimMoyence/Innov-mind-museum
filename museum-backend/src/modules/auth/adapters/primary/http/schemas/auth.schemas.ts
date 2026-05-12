import { z } from 'zod';

import { CONTENT_PREFERENCES } from '@modules/auth/domain/consent/content-preference';
import { TTS_VOICES } from '@modules/chat/domain/voice/voice-catalog';

export const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
  firstname: z.string().max(100).optional(),
  lastname: z.string().max(100).optional(),
  locale: z.enum(['fr', 'en']).optional(),
  // CNIL Délibération 2021-018 — digital majority is 15 years. Standalone
  // registration is rejected below the threshold (parental flow handled by
  // the BE returning `MINOR_PARENTAL_CONSENT_REQUIRED`). YYYY-MM-DD wire
  // format; the use case parses and computes the age server-side.
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
  // F3 — optional during the mobile rollout window. Once `OIDC_NONCE_ENFORCE`
  // flips to true, the use case rejects requests omitting this field.
  // Bounds: 16 chars (~96 bits even for poorly-chosen nonces) up to 256 chars
  // to leave headroom for client-side hashed variants without enabling DoS
  // payloads.
  nonce: z.string().min(16).max(256).optional(),
});

// F11-mobile — single-use code minted by /google/callback for the mobile
// platform branch. Bounds match the OTC issuer: base64url 22 chars at the
// floor (16 raw bytes), 64 ceiling so a future entropy bump stays in-bounds
// without re-deploying the schema.
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
  locale: z.enum(['fr', 'en']).optional(),
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
  locale: z.enum(['fr', 'en']).optional(),
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

// Spec C T2.4 — Visitor's preferred TTS voice. `null` resets to the env-level
// default. Accepts only voices listed in the shared TTS_VOICES catalog; any
// other value (unknown voice, non-string, missing field) → 400 from Zod.
export const updateTtsVoiceSchema = z.object({
  voice: z.union([z.null(), z.enum(TTS_VOICES)]),
});
