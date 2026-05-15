/**
 * B6 — Proactive in-museum suggestion banner.
 *
 * Card rendered on the home screen suggesting the visitor start a voice
 * conversation when GPS detects them within 200 m of a known museum
 * ("You're at <museumName> — Ask the assistant?"). Dismissable via a
 * separate Pressable (round X button, own `accessibilityRole="button"` +
 * label) — the dismiss tap MUST NOT trigger the card tap (R21).
 *
 * Tap card → `onStart(museum)` (parent calls `useStartConversation` with
 *           `intent: 'audio'` + `museumId`/`museumName`/`coordinates`).
 * Tap dismiss → `onDismiss()` (parent persists 4 h flag via the hook).
 *
 * Spec : `docs/chat-ux-refonte/specs/B6.md` §1.2 R15-R26 ; §4 AC14-AC20.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { radius, semantic, space } from '@/shared/ui/tokens';

import type { ProactiveMuseum } from '@/features/chat/application/useProactiveMuseumSuggestion';

interface ProactiveMuseumBannerProps {
  /** Proactive museum payload, or `null` when no in-museum match was found. */
  readonly museum: ProactiveMuseum | null;
  /** Invoked with the full museum verbatim when the card is tapped. */
  readonly onStart?: (museum: ProactiveMuseum) => void;
  /** Invoked when the dismiss button is tapped. */
  readonly onDismiss?: () => void;
}

/**
 * B6 — Proactive in-museum suggestion banner. Renders `null` when `museum`
 * is `null` (R15). When non-null, renders a Pressable card with an
 * Ionicons `location` icon, title interpolated with `{{museumName}}`,
 * subtitle, and a SEPARATE dismiss Pressable (own role/label, hit-slop 12
 * → ≥ 44 dp effective hit target, WCAG 2.5.5).
 *
 * React.memo'd with default ref equality (R26) — the parent hook keeps a
 * stable museum reference unless the underlying match changes.
 */
export const ProactiveMuseumBanner = React.memo(function ProactiveMuseumBanner({
  museum,
  onStart,
  onDismiss,
}: ProactiveMuseumBannerProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  if (!museum) {
    return null;
  }

  const handleCardPress = (): void => {
    onStart?.(museum);
  };

  const handleDismissPress = (event?: GestureResponderEvent): void => {
    // Stop the press event from bubbling to the outer card Pressable so the
    // dismiss tap never doubles as a start-conversation tap (R21, AC20). RN's
    // synthetic event from `fireEvent.press` may be `undefined` in tests —
    // guard so we never crash the dismiss path.
    if (event && typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
    onDismiss?.();
  };

  return (
    <Pressable
      testID="proactive-museum-banner"
      accessibilityRole="button"
      accessibilityLabel={t('chat.proactive_museum.cta_a11y_label', { museumName: museum.name })}
      accessibilityHint={t('chat.proactive_museum.cta_a11y_hint')}
      onPress={handleCardPress}
      style={[
        styles.root,
        {
          backgroundColor: theme.cardBackground,
          borderColor: theme.cardBorder,
        },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: theme.surface }]}>
        <Ionicons name="location" size={20} color={theme.primary} />
      </View>
      <View style={styles.content}>
        <Text
          testID="proactive-museum-title"
          numberOfLines={1}
          style={[styles.title, { color: theme.textPrimary }]}
        >
          {t('chat.proactive_museum.title', { museumName: museum.name })}
        </Text>
        <Text
          testID="proactive-museum-subtitle"
          numberOfLines={1}
          style={[styles.subtitle, { color: theme.textSecondary }]}
        >
          {t('chat.proactive_museum.subtitle')}
        </Text>
      </View>
      <Pressable
        testID="proactive-museum-dismiss"
        accessibilityRole="button"
        accessibilityLabel={t('chat.proactive_museum.a11y_dismiss')}
        onPress={handleDismissPress}
        hitSlop={12}
        style={styles.dismiss}
      >
        <Ionicons name="close" size={20} color={theme.textSecondary} />
      </Pressable>
    </Pressable>
  );
});

const ICON_SIZE = 48;

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['3'],
    paddingVertical: space['3'],
    paddingHorizontal: space['4'],
    borderRadius: semantic.modal.radius,
    borderWidth: semantic.input.borderWidth,
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: space['1'],
  },
  title: {
    fontSize: semantic.form.labelSize,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: semantic.section.captionSize,
    fontWeight: '400',
  },
  dismiss: {
    width: space['8'],
    height: space['8'],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
