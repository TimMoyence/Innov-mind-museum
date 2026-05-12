import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ExpertiseBadge } from '@/features/chat/ui/ExpertiseBadge';
import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius, fontSize } from '@/shared/ui/tokens';

interface ChatHeaderProps {
  sessionTitle: string | null;
  expertiseLevel?: 'beginner' | 'intermediate' | 'expert';
  isClosing: boolean;
  onClose: () => void;
  onSummary?: () => void;
  audioDescriptionEnabled?: boolean;
  onToggleAudioDescription?: () => void;
  /**
   * Tap handler for the persistent "AI" badge that opens the on-demand
   * disclosure recap modal. Required by EU AI Act Article 50 — see
   * `docs/legal/AI_DISCLOSURE.md`. Omit only in non-chat contexts.
   */
  onOpenAiDisclosure?: () => void;
}

/** Chat session header with title, museum name, expertise badge, and close button. */
export function ChatHeader({
  sessionTitle,
  expertiseLevel,
  isClosing,
  onClose,
  onSummary,
  audioDescriptionEnabled,
  onToggleAudioDescription,
  onOpenAiDisclosure,
}: ChatHeaderProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <GlassCard style={styles.headerShell} intensity={58}>
      <View style={styles.headerRow}>
        <View style={styles.headerContent}>
          <View style={styles.titleRow}>
            <Text style={[styles.header, { color: theme.textPrimary }]} numberOfLines={1}>
              {sessionTitle ?? t('chat.fallback_title')}
            </Text>
            {onOpenAiDisclosure ? (
              <Pressable
                onPress={onOpenAiDisclosure}
                style={[
                  styles.aiBadge,
                  { backgroundColor: theme.primaryTint, borderColor: theme.primary },
                ]}
                testID="ai-disclosure-badge"
                accessibilityRole="button"
                accessibilityLabel={t('voice.disclosure.badgeA11y')}
                hitSlop={8}
              >
                <Text style={[styles.aiBadgeText, { color: theme.primary }]}>
                  {t('voice.disclosure.badgeLabel')}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {expertiseLevel ? <ExpertiseBadge level={expertiseLevel} /> : null}
        </View>
        <View style={styles.headerActions}>
          {onToggleAudioDescription ? (
            <Pressable
              onPress={onToggleAudioDescription}
              style={[
                styles.closeButton,
                {
                  borderColor: audioDescriptionEnabled ? theme.primary : theme.inputBorder,
                  backgroundColor: theme.surface,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                audioDescriptionEnabled ? t('chat.audio_mode_off') : t('chat.audio_mode_on')
              }
            >
              <Ionicons
                name={audioDescriptionEnabled ? 'headset' : 'headset-outline'}
                size={20}
                color={audioDescriptionEnabled ? theme.primary : theme.textSecondary}
              />
            </Pressable>
          ) : null}
          {onSummary ? (
            <Pressable
              onPress={onSummary}
              style={[
                styles.closeButton,
                { borderColor: theme.inputBorder, backgroundColor: theme.surface },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t('visitSummary.visitSummary')}
            >
              <Ionicons name="document-text-outline" size={20} color={theme.primary} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={onClose}
            style={[
              styles.closeButton,
              { borderColor: theme.inputBorder, backgroundColor: theme.surface },
            ]}
            disabled={isClosing}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.chat.close')}
          >
            {isClosing ? (
              <ActivityIndicator size="small" color={theme.textSecondary} />
            ) : (
              <Ionicons name="close" size={20} color={theme.textPrimary} />
            )}
          </Pressable>
        </View>
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  headerShell: {
    marginBottom: semantic.section.gap,
  },
  headerRow: {
    paddingHorizontal: semantic.chat.bubblePaddingX,
    paddingVertical: semantic.list.itemPaddingY,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space['2.5'],
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.chat.gap,
  },
  headerContent: {
    flex: 1,
  },
  header: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    flexShrink: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2'],
  },
  aiBadge: {
    paddingHorizontal: space['2'],
    paddingVertical: space['0.5'],
    borderRadius: radius.full,
    borderWidth: semantic.input.borderWidth,
  },
  aiBadgeText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  closeButton: {
    borderRadius: radius.full,
    borderWidth: semantic.input.borderWidth,
    width: space['9'],
    height: space['9'],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
