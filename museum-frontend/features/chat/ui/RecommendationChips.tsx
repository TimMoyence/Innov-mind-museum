import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { liquidColors } from '@/shared/ui/liquidTheme';

interface RecommendationChipsProps {
  recommendations: string[];
  onPress: (text: string) => void;
}

/** Renders a horizontal scrollable row of recommendation chips that the user can tap to populate the input. */
export const RecommendationChips = ({ recommendations, onPress }: RecommendationChipsProps) => {
  if (!recommendations.length) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {recommendations.map((recommendation) => (
        <Pressable
          key={recommendation}
          style={styles.chip}
          onPress={() => onPress(recommendation)}
        >
          <Text style={styles.chipText} numberOfLines={1}>{recommendation}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 4,
    gap: 8,
  },
  chip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    backgroundColor: 'rgba(255,255,255,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 220,
  },
  chipText: {
    fontSize: 13,
    color: liquidColors.primary,
    fontWeight: '500',
  },
});
