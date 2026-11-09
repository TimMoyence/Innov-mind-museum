import { colors } from '../colors';
import { spacing } from '../spacing';

export const errorStateTokens = {
  iconName: 'warning-outline' as const,
  iconBg: '#FEF3C7',
  iconColor: colors.status.warning.light,
  titleColor: colors.primary[900],
  descriptionColor: colors.primary[700],
  layout: {
    padding: spacing['5'].px,
    gap: spacing['3'].px,
    inlineRadius: 10,
    fullscreenPadding: spacing['8'].px,
  },
} as const;
