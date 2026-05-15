/**
 * R1 (C6) — Soft-paywall tier enum for `User`.
 *
 * Mirror of `user-role.ts` shape : `const … as const` + derived type union.
 * Two values only :
 *   - `free`    — default tier ; subject to the monthly session quota
 *                (`monthlySessionQuota` middleware on POST /api/sessions).
 *   - `premium` — bypass-everything tier ; flipped via super-admin override
 *                (`PATCH /api/admin/users/:id/tier`). V1 has no Stripe ; the
 *                flip is the canonical premium grant until R1 funnel data
 *                unblocks the Stripe go/no-go (R1 §0.1).
 */
export const UserTier = {
  FREE: 'free',
  PREMIUM: 'premium',
} as const;

/** Union of every UserTier value. */
export type UserTier = (typeof UserTier)[keyof typeof UserTier];
