import { z } from 'zod';

import { CONTENT_PREFERENCES } from '@modules/auth/domain/consent/content-preference';
import { TTS_VOICES } from '@modules/chat/domain/voice/voice-catalog';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  firstname: z.string().max(100).optional(),
  lastname: z.string().max(100).optional(),
  locale: z.enum(['fr', 'en']).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
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

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
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
  newEmail: z.string().email(),
  currentPassword: z.string().min(1),
  locale: z.enum(['fr', 'en']).optional(),
});

export const confirmEmailChangeSchema = z.object({
  token: z.string().min(1),
});

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresAt: z.string().datetime().optional(),
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
