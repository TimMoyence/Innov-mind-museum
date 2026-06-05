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
    paddingHorizontal: space['3'],
    paddingVertical: space['1'],
    alignItems: 'center',
  },
  text: {
    fontSize: fontSize.xs,
    textAlign: 'center',
    // R1/R2 (design §D2): the EU AI Act Art. 50 disclosure renders at full
    // token contrast (no dimming). It must meet WCAG 2.1 AA 4.5:1;
    // `theme.textSecondary` solid-on-solid floor clears AA, so the structural
    // fix (full contrast) is sufficient — no token change.
  },
});
