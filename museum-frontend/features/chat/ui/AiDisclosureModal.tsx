import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius, fontSize } from '@/shared/ui/tokens';

interface AiDisclosureModalProps {
  /** Modal visibility. Owned by the parent (typically `ChatHeader` via the AI badge). */
  visible: boolean;
  /** Called when the user dismisses the modal (close button or backdrop). */
  onClose: () => void;
  /**
   * Optional handler invoked when the "Learn more" link is tapped. The chat
   * session screen typically opens the in-app browser pointing to the
   * `docs/legal/AI_DISCLOSURE.md`-derived public URL.
   */
  onLearnMore?: () => void;
}

/**
 * Recap modal shown when the persistent "AI" badge in the chat header is
 * tapped. Provides the Article 50 disclosure copy plus a "Learn more" link
 * to the public AI disclosure page.
 *
 * Distinct from `VoiceSessionIntro`:
 * - `VoiceSessionIntro` is the *gate* shown once per voice session before
 *   the mic activates (mandatory pre-interaction disclosure).
 * - `AiDisclosureModal` is a *recap* — the user can pull up the disclosure
 *   on demand at any point during the conversation.
 */
export const AiDisclosureModal = ({ visible, onClose, onLearnMore }: AiDisclosureModalProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: theme.modalOverlay }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('voice.disclosure.modalClose')}
      >
        <Pressable
          style={[styles.card, { backgroundColor: theme.cardBackground }]}
          onPress={(e) => {
            e.stopPropagation();
          }}
        >
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: theme.textPrimary }]} accessibilityRole="header">
              {t('voice.disclosure.modalTitle')}
            </Text>
            <Pressable
              onPress={onClose}
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
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
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
