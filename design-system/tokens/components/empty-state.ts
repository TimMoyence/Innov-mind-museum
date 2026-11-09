import { colors } from '../colors';
import { spacing } from '../spacing';

export const emptyStateTokens = {
  variants: {
    chat: {
      iconName: 'chatbubble-ellipses-outline',
      iconColor: colors.primary[500],
      iconBg: colors.primary[50],
    },
    museums: {
      iconName: 'business-outline',
      iconColor: '#0EA5E9',
      iconBg: '#E0F2FE',
    },
    reviews: {
      iconName: 'star-outline',
      iconColor: '#D4A853',
      iconBg: '#FEF9EC',
    },
    dailyArt: {
      iconName: 'image-outline',
      iconColor: '#7C3AED',
      iconBg: '#EDE9FE',
    },
    conversations: {
      iconName: 'albums-outline',
      iconColor: '#0EA5E9',
      iconBg: '#E0F2FE',
    },
  },
  layout: {
    padding: spacing['8'].px,
    gap: spacing['4'].px,
    iconSize: 80,
    titleSize: 18,
    descriptionSize: 14,
  },
} as const;

export type EmptyStateVariant = keyof typeof emptyStateTokens.variants;
