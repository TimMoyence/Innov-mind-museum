import type { ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

export interface WalkSuggestionChipsProps {
  suggestions: string[];
  onSelect: (text: string) => void;
}

/**
 * Horizontally scrollable chip strip rendering walk-mode artwork suggestions.
 * Tap a chip to send its text as the next user prompt.
 *
 * Renders nothing when suggestions is empty so the layout collapses cleanly.
 */
export function WalkSuggestionChips({
  suggestions,
  onSelect,
}: WalkSuggestionChipsProps): ReactElement | null {
  const { theme } = useTheme();
  const { t } = useTranslation();

  if (suggestions.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="list"
      accessibilityLabel={t('chat.walk.suggestionsLabel', { defaultValue: 'Walk suggestions' })}
    >
      {suggestions.map((s) => (
        <Pressable
          key={s}
          onPress={() => {
            onSelect(s);
          }}
          style={[
            styles.chip,
            { backgroundColor: theme.primaryTint, borderColor: theme.primaryBorderSubtle },
          ]}
          accessibilityRole="button"
          accessibilityHint={t('chat.walk.suggestionHint', {
            defaultValue: 'Sends this suggestion as your next prompt',
          })}
        >
          <Text style={[styles.chipText, { color: theme.primary }]}>{s}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: space['2'], paddingHorizontal: space['3'] },
  chip: {
    paddingVertical: space['2'],
    paddingHorizontal: space['3'],
    borderRadius: semantic.badge.radiusFull,
    borderWidth: semantic.input.borderWidth,
  },
  chipText: { fontSize: 14, fontWeight: '600' },
});
