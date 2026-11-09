import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { HorizontalStrip } from '@/shared/ui/HorizontalStrip';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

interface RecommendationChipsProps {
  recommendations: string[];
  onPress: (text: string) => void;
  disabled?: boolean;
}

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
      <HorizontalStrip contentContainerStyle={styles.container}>
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
      </HorizontalStrip>
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
    alignItems: 'flex-start',
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
    flexShrink: 1,
    fontSize: semantic.form.labelSize,
    fontWeight: '500',
  },
});
