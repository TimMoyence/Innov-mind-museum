import { StyleSheet, Text, View } from 'react-native';

import { liquidColors } from '@/shared/ui/liquidTheme';

interface ExpertiseBadgeProps {
  level: 'beginner' | 'intermediate' | 'expert';
}

const labelByLevel: Record<string, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  expert: 'Expert',
};

const colorByLevel: Record<string, string> = {
  beginner: '#059669',
  intermediate: '#D97706',
  expert: '#7C3AED',
};

/** Displays a color-coded pill badge indicating the user's expertise level (beginner, intermediate, or expert). */
export const ExpertiseBadge = ({ level }: ExpertiseBadgeProps) => {
  const label = labelByLevel[level] || level;
  const color = colorByLevel[level] || liquidColors.primary;

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
