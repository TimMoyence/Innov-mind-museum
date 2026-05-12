import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { fontSize, space } from '@/shared/ui/tokens';

/**
 * Persistent AI-generated-content disclosure footer required by EU AI Act
 * Article 50 (in force 2026-08-02). Rendered below the chat thread so any
 * user interacting with the assistant sees the notice without scrolling away.
 * Kept intentionally minimal — copy lives in i18n (`ai_disclosure.chat_footer`)
 * so legal can iterate without code changes.
 */
export function AiDisclosureFooter() {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <View style={styles.container} accessibilityRole="text">
      <Text style={[styles.text, { color: theme.textSecondary }]}>
        {t('ai_disclosure.chat_footer')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    alignItems: 'center',
  },
  text: {
    fontSize: fontSize.xs,
    textAlign: 'center',
    opacity: 0.7,
  },
});
