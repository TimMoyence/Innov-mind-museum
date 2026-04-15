import { z } from 'zod';

import { CONTENT_PREFERENCES } from '../../../domain/content-preference';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  firstname: z.string().max(100).optional(),
  lastname: z.string().max(100).optional(),
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
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
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
