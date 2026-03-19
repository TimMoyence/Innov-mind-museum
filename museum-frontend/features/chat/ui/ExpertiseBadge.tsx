import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';

interface ExpertiseBadgeProps {
  level: 'beginner' | 'intermediate' | 'expert';
}

const colorByLevel: Record<string, string> = {
  beginner: '#059669',
  intermediate: '#D97706',
  expert: '#7C3AED',
};

/** Displays a color-coded pill badge indicating the user's expertise level (beginner, intermediate, or expert). */
export const ExpertiseBadge = ({ level }: ExpertiseBadgeProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const label = t(`expertiseBadge.${level}`);
  const color = colorByLevel[level] || theme.primary;

  return (
    <View style={[styles.pill, { backgroundColor: `${color}14` }]}>
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pill: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
  },
});
