import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens';

interface ExpertiseBadgeProps {
  level: 'beginner' | 'intermediate' | 'expert';
}

/** Displays a color-coded pill badge indicating the user's expertise level (beginner, intermediate, or expert). */
export const ExpertiseBadge = ({ level }: ExpertiseBadgeProps) => {
  const { theme, isDark } = useTheme();
  const { t } = useTranslation();
  const label = t(`expertiseBadge.${level}`);
  const levelColors = semantic.expertiseLevels[level];
  const color = (isDark ? levelColors.dark : levelColors.light) || theme.primary;

  return (
    <View style={[styles.pill, { backgroundColor: `${color}14` }]}>
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    borderRadius: semantic.badge.radius,
    paddingHorizontal: semantic.badge.paddingX,
    paddingVertical: semantic.badge.paddingYTight,
  },
  text: {
    fontSize: semantic.badge.fontSizeSmall,
    fontWeight: '700',
  },
});
