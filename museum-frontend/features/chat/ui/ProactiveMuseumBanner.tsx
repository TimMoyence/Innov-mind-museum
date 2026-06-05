/**
 * B6 / W3 — Proactive in-museum suggestion banner.
 *
 * Two display modes, picked by `museum.confidence`:
 *
 *   - confidence > 0.8 → auto-pickup banner (legacy B6 behaviour).
 *     Single Pressable card "You're at <museumName> — Ask the assistant?"
 *     + a separate close (X) Pressable. Tap card → `onStart(museum)`.
 *
 *   - confidence ∈ (0.5, 0.8] → confirm bottom-sheet card.
 *     "Tu sembles proche du <museumName>, on démarre la balade ?"
 *     + Yes button (`onStart`) + Choose-another button
 *     (`onChooseAnother`, falls back to `onDismiss` when absent).
 *
 * The hook (`useProactiveMuseumSuggestion`) returns null below 0.5, so the
 * banner never renders the low-confidence band — the picker is the manual
 * fallback (R14, wired separately in `useStartConversation`).
 *
 * Spec : `team-state/2026-05-17-w3-geo-walk-intra/spec.md` R12-R13.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { radius, semantic, space } from '@/shared/ui/tokens';

import type { ProactiveMuseum } from '@/features/chat/application/useProactiveMuseumSuggestion';

/** Above this threshold the banner uses the auto-pickup layout (legacy B6). */
const AUTO_PICKUP_CONFIDENCE_THRESHOLD = 0.8;

interface ProactiveMuseumBannerProps {
  /** Proactive museum payload, or `null` when no in-museum match was found. */
  readonly museum: ProactiveMuseum | null;
  /** Invoked with the full museum verbatim when the card / Yes button is tapped. */
  readonly onStart?: (museum: ProactiveMuseum) => void;
  /** Invoked when the dismiss (X) button is tapped (auto-pickup band only). */
  readonly onDismiss?: () => void;
  /**
   * Invoked when the user picks "Choose another" inside the confirm bottom-sheet.
   * When omitted in the confirm band, the button falls back to `onDismiss`.
   */
  readonly onChooseAnother?: () => void;
}

export const ProactiveMuseumBanner = React.memo(function ProactiveMuseumBanner({
  museum,
  onStart,
  onDismiss,
  onChooseAnother,
}: ProactiveMuseumBannerProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  if (!museum) {
    return null;
  }

  const isAutoPickup = museum.confidence > AUTO_PICKUP_CONFIDENCE_THRESHOLD;

  const handleStartPress = (): void => {
    onStart?.(museum);
  };

  const handleDismissPress = (event?: GestureResponderEvent): void => {
    if (event && typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
    onDismiss?.();
  };

  const handleChooseAnotherPress = (): void => {
    if (onChooseAnother) {
      onChooseAnother();
    } else {
      onDismiss?.();
    }
  };

  // ── confirm bottom-sheet branch (confidence ∈ (0.5, 0.8]) ────────────────
  if (!isAutoPickup) {
    return (
      <View
        testID="proactive-museum-confirm-sheet"
        accessibilityRole="alert"
        accessibilityLabel={t('chat.proactive.confirm_sheet.title', { museumName: museum.name })}
        style={[
          styles.confirmRoot,
          {
            backgroundColor: theme.cardBackground,
            borderColor: theme.cardBorder,
          },
        ]}
      >
        <View style={[styles.icon, { backgroundColor: theme.surface }]}>
          <Ionicons name="location-outline" size={20} color={theme.primary} />
        </View>
        <View style={styles.content}>
          <Text
            testID="proactive-museum-confirm-title"
            numberOfLines={2}
            style={[styles.title, { color: theme.textPrimary }]}
          >
            {t('chat.proactive.confirm_sheet.title', { museumName: museum.name })}
          </Text>
          <Text
            testID="proactive-museum-confirm-body"
            numberOfLines={2}
            style={[styles.subtitle, { color: theme.textSecondary }]}
          >
            {t('chat.proactive.confirm_sheet.body')}
          </Text>
        </View>
        <View style={styles.confirmActions}>
          <Pressable
            testID="proactive-museum-confirm-yes"
            accessibilityRole="button"
            accessibilityLabel={t('chat.proactive.confirm_sheet.yes')}
            onPress={handleStartPress}
            style={[styles.confirmYes, { backgroundColor: theme.primary }]}
          >
            <Text style={[styles.confirmYesText, { color: theme.primaryContrast }]}>
              {t('chat.proactive.confirm_sheet.yes')}
            </Text>
          </Pressable>
          <Pressable
            testID="proactive-museum-confirm-choose-another"
            accessibilityRole="button"
            accessibilityLabel={t('chat.proactive.confirm_sheet.choose_another')}
            onPress={handleChooseAnotherPress}
            style={styles.confirmChooseAnother}
          >
            <Text style={[styles.confirmChooseAnotherText, { color: theme.textSecondary }]}>
              {t('chat.proactive.confirm_sheet.choose_another')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── auto-pickup branch (confidence > 0.8) — legacy B6 layout ─────────────
  return (
    <Pressable
      testID="proactive-museum-banner"
      accessibilityRole="button"
      accessibilityLabel={t('chat.proactive_museum.cta_a11y_label', { museumName: museum.name })}
      accessibilityHint={t('chat.proactive_museum.cta_a11y_hint')}
      onPress={handleStartPress}
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
  confirmRoot: {
    flexDirection: 'column',
    gap: space['3'],
    paddingVertical: space['4'],
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
  confirmActions: {
    flexDirection: 'row',
    gap: space['2'],
  },
  confirmYes: {
    flex: 1,
    paddingVertical: space['2'],
    paddingHorizontal: space['4'],
    borderRadius: semantic.modal.radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmYesText: {
    fontSize: semantic.button.fontSize,
    fontWeight: '600',
  },
  confirmChooseAnother: {
    flex: 1,
    paddingVertical: space['2'],
    paddingHorizontal: space['4'],
    borderRadius: semantic.modal.radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmChooseAnotherText: {
    fontSize: semantic.button.fontSize,
    fontWeight: '500',
  },
});
