import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';

interface RecommendationChipsProps {
  recommendations: string[];
  onPress: (text: string) => void;
  /** When true, all chips are disabled (e.g. during an active send). */
  disabled?: boolean;
}

/** Renders a horizontal scrollable row of recommendation chips that the user can tap to populate the input. */
export const RecommendationChips = ({ recommendations, onPress, disabled = false }: RecommendationChipsProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  if (!recommendations.length) return null;

  return (
    <View>
      <Text style={styles.sectionLabel}>{t('recommendationChips.section_label')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.container}
      >
        {recommendations.map((recommendation) => (
          <Pressable
            key={recommendation}
            style={[styles.chip, disabled && styles.chipDisabled]}
            onPress={() => onPress(recommendation)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={recommendation}
            accessibilityHint={t('a11y.chat.recommendation_hint')}
          >
            <Ionicons name='create-outline' size={14} color={theme.primary} />
            <Text style={[styles.chipText, { color: theme.primary }]} numberOfLines={1}>{recommendation}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  container: {
    paddingVertical: 4,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.35)',
    backgroundColor: 'rgba(255,255,255,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 220,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
