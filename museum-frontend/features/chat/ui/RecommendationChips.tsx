import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

interface RecommendationChipsProps {
  recommendations: string[];
  onPress: (text: string) => void;
  /** When true, all chips are disabled (e.g. during an active send). */
  disabled?: boolean;
}

/** Renders a horizontal scrollable row of recommendation chips that the user can tap to populate the input. */
export const RecommendationChips = ({
  recommendations,
  onPress,
  disabled = false,
}: RecommendationChipsProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  if (!recommendations.length) return null;

  return (
    <View>
      <Text style={[styles.sectionLabel, { color: theme.placeholderText }]}>
        {t('recommendationChips.section_label')}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.container}
      >
        {recommendations.map((recommendation) => (
          <Pressable
            key={recommendation}
            style={[
              styles.chip,
              { borderColor: theme.separator, backgroundColor: theme.surface },
              disabled && styles.chipDisabled,
            ]}
            onPress={() => {
              onPress(recommendation);
            }}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={recommendation}
            accessibilityHint={t('a11y.chat.recommendation_hint')}
          >
            <Ionicons name="create-outline" size={14} color={theme.primary} />
            <Text style={[styles.chipText, { color: theme.primary }]} numberOfLines={1}>
              {recommendation}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: semantic.section.labelSize,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: space['1'],
  },
  container: {
    paddingVertical: space['1'],
    gap: semantic.chat.gap,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.chat.gapSmall,
    borderRadius: semantic.card.radiusCompact,
    borderWidth: semantic.input.borderWidth,
    paddingHorizontal: semantic.card.paddingCompact,
    paddingVertical: semantic.badge.paddingX,
    maxWidth: 220,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipText: {
    fontSize: semantic.form.labelSize,
    fontWeight: '500',
  },
});
