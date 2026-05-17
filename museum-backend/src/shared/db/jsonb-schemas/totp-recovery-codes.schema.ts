import { z } from 'zod';

/**
 * TOTP recovery codes — bcrypt hash (never plain code) + nullable consumedAt
 * ISO. Shape matches TotpRecoveryCode in src/modules/auth/domain/totp-secret.entity.ts.
 * Empty array valid (pre-enrollment). consumedAt null while usable.
 */
export const TotpRecoveryCodesSchema = z.array(
  z.object({
    hash: z.string().min(1),
    consumedAt: z.iso.datetime().nullable(),
  }),
);
export type TotpRecoveryCodes = z.infer<typeof TotpRecoveryCodesSchema>;
