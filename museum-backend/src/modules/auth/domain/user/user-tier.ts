export const UserTier = {
  FREE: 'free',
  PREMIUM: 'premium',
} as const;

export type UserTier = (typeof UserTier)[keyof typeof UserTier];
