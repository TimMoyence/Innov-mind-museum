import { colors } from '../colors';
import { spacing } from '../spacing';

/**
 * Per-variant token mappings for the EmptyState primitive.
 * Each variant maps to an Ionicons name + a backplate color tint.
 */
export const emptyStateTokens = {
  variants: {
    chat: {
      iconName: 'chatbubbles-outline',
      iconBg: colors.primary[50],
      iconColor: colors.primary[500],
    },
    museums: {
      iconName: 'business-outline',
      iconBg: colors.accent[400] + '20',
      iconColor: colors.accent[600],
    },
    reviews: {
      iconName: 'star-outline',
      iconBg: colors.gold[400] + '20',
      iconColor: colors.gold[600],
    },
    dailyArt: {
      iconName: 'image-outline',
      iconBg: colors.primary[100],
      iconColor: colors.primary[700],
    },
    conversations: {
      iconName: 'time-outline',
      iconBg: colors.primary[50],
      iconColor: colors.primary[500],
    },
  },
  layout: {
    padding: spacing['6'].px,
    gap: spacing['3'].px,
    iconSize: 56,
    titleSize: 18,
    descriptionSize: 14,
  },
} as const;

export type EmptyStateVariant = keyof typeof emptyStateTokens.variants;
