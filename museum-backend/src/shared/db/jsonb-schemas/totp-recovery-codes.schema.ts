import { z } from 'zod';

/**
 * TOTP recovery codes — array of persisted recovery code entries.
 *
 * Each entry holds a bcrypt hash (never the plain code) and a nullable
 * consumedAt ISO timestamp. Shape matches TotpRecoveryCode in
 * src/modules/auth/domain/totp-secret.entity.ts.
 *
 * Empty array is valid (pre-enrollment state). consumedAt is null while
 * the code is still usable; set to an ISO-8601 string on first use.
 */
export const TotpRecoveryCodesSchema = z.array(
  z.object({
    hash: z.string().min(1),
    consumedAt: z.string().datetime().nullable(),
  }),
);
/**
 *
 */
export type TotpRecoveryCodes = z.infer<typeof TotpRecoveryCodesSchema>;
