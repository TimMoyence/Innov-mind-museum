import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius, fontSize } from '@/shared/ui/tokens';

interface AiDisclosureSheetContentProps {
  close: () => void;
  /**
   * Optional handler invoked when the "Learn more" link is tapped. Typically
   * routes the user to the public AI disclosure page; the parent screen owns
   * the navigation side-effect and the sheet closes itself.
   */
  onLearnMore?: () => void;
}

/**
 * Bottom-sheet content (full-screen, non-blocking) for the on-demand AI
 * disclosure recap. Mounted by `<BottomSheetRouter>` for the `ai-disclosure`
 * route. Replaces the previous `<AiDisclosureModal>` — the centered card
 * layout is preserved inside the router's fullscreen surface.
 */
export const AiDisclosureSheetContent = ({ close, onLearnMore }: AiDisclosureSheetContentProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: theme.modalOverlay }]}>
      <View style={[styles.card, { backgroundColor: theme.cardBackground }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: theme.textPrimary }]} accessibilityRole="header">
            {t('voice.disclosure.modalTitle')}
          </Text>
          <Pressable
            onPress={close}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('voice.disclosure.modalClose')}
          >
            <Ionicons name="close" size={22} color={theme.textPrimary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.bodyContent}>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            {t('voice.disclosure.aiNotice')}
          </Text>
          {onLearnMore ? (
            <Pressable
              onPress={onLearnMore}
              accessibilityRole="link"
              accessibilityLabel={t('voice.disclosure.modalLearnMore')}
            >
              <Text style={[styles.link, { color: theme.primary }]}>
                {t('voice.disclosure.modalLearnMore')}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: semantic.screen.paddingXL,
  },
  card: {
    borderRadius: radius.lg,
    padding: semantic.card.padding,
    gap: semantic.form.gapLarge,
    maxHeight: '70%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
  },
  bodyContent: {
    gap: space['3'],
  },
  body: {
    fontSize: fontSize['base-'],
    lineHeight: semantic.modal.padding,
  },
  link: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
