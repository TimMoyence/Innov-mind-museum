/**
 * R1 (C6) — soft-paywall tier. `free` subject to monthly session quota
 * (`monthlySessionQuota` middleware on POST /api/sessions). `premium` bypasses;
 * flipped via super-admin `PATCH /api/admin/users/:id/tier`. V1 has no Stripe —
 * the flip is the canonical premium grant until R1 funnel data unblocks Stripe
 * (R1 §0.1).
 */
export const UserTier = {
  FREE: 'free',
  PREMIUM: 'premium',
} as const;

export type UserTier = (typeof UserTier)[keyof typeof UserTier];
