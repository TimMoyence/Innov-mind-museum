/**
 * B2 — Conversation resumption banner.
 *
 * Card rendered at the top of the home screen suggesting the user reopen
 * their most recent chat session ("Continue your conversation about
 * <last artwork>" / "Reprendre …"). Dismissable via a separate Pressable
 * (round X button, own `accessibilityRole="button"` + label) — the dismiss
 * tap MUST NOT trigger the card tap (R19).
 *
 * Tap card → `onResume(session.id)` (parent navigates via `router.push`).
 * Tap dismiss → `onDismiss()` (parent persists 24 h flag via the hook).
 *
 * Spec : `docs/chat-ux-refonte/specs/B2.md` §1.2 R13-R24 ; §1.3 R25-R29 ;
 *        §4 AC11-AC19.
 */

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { radius, semantic, space } from '@/shared/ui/tokens';

import type { ResumableSession } from '@/features/chat/application/useResumableSession';

/** Minimal `t` signature used by {@link formatResumptionTimeAgo} — keeps the helper decoupled from i18next runtime. */
type ResumptionTFunction = (key: string, opts?: { count: number }) => string;

const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 3_600_000;
const ONE_DAY_MS = 86_400_000;

/**
 * Pure helper picking the `chat.resumption.time_ago.*` i18n key + `count`
 * interpolation for a given session age. Boundaries are `< 1 min` →
 * `just_now`, `< 1 h` → `minutes`, `< 1 day` → `hours`, otherwise `days`.
 * Invalid ISO strings fall back to `just_now` (no throw — R29).
 */
export function formatResumptionTimeAgo(
  updatedAtIso: string,
  now: number,
  t: ResumptionTFunction,
): string {
  const updatedAtMs = new Date(updatedAtIso).getTime();
  if (Number.isNaN(updatedAtMs)) {
    return t('chat.resumption.time_ago.just_now');
  }
  const delta = now - updatedAtMs;
  if (delta < ONE_MINUTE_MS) {
    return t('chat.resumption.time_ago.just_now');
  }
  if (delta < ONE_HOUR_MS) {
    return t('chat.resumption.time_ago.minutes', { count: Math.floor(delta / ONE_MINUTE_MS) });
  }
  if (delta < ONE_DAY_MS) {
    return t('chat.resumption.time_ago.hours', { count: Math.floor(delta / ONE_HOUR_MS) });
  }
  return t('chat.resumption.time_ago.days', { count: Math.floor(delta / ONE_DAY_MS) });
}

interface ConversationResumptionBannerProps {
  /** Resumable session payload, or `null` when no eligible session exists. */
  readonly session: ResumableSession | null;
  /** Invoked with the session id when the card is tapped. */
  readonly onResume?: (sessionId: string) => void;
  /** Invoked when the dismiss button is tapped. */
  readonly onDismiss?: () => void;
}

/**
 * B2 — Conversation resumption banner. Renders `null` when `session` is
 * `null` (R13). When non-null, renders a Pressable card with an Ionicons
 * placeholder thumb, title (with-artwork or fallback branch), subtitle
 * (with-museum or fallback branch), and a SEPARATE dismiss Pressable
 * (own role/label, hit-slop 12 → ≥ 44 dp effective hit target).
 *
 * React.memo'd with default ref equality (R24) — the parent hook keeps a
 * stable session reference unless it changes.
 */
export const ConversationResumptionBanner = React.memo(function ConversationResumptionBanner({
  session,
  onResume,
  onDismiss,
}: ConversationResumptionBannerProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  // Crystallise `now` on mount so re-renders stay deterministic (react-hooks/purity).
  // Acceptable staleness V1 — the banner already only lives a few seconds on the
  // home screen before user interaction. Tick refresh deferred V1.1.
  const [now] = useState<number>(() => Date.now());

  if (!session) {
    return null;
  }

  const artworkTitle =
    typeof session.lastArtworkTitle === 'string' && session.lastArtworkTitle.length > 0
      ? session.lastArtworkTitle
      : null;
  const museumName =
    typeof session.museumName === 'string' && session.museumName.length > 0
      ? session.museumName
      : null;
  // `t` carries the full i18next key union; cast to the minimal helper signature
  // — same approach used by `formatDistance` (UFR-013 honesty: type alias not import).
  const timeAgo = formatResumptionTimeAgo(session.updatedAt, now, t as ResumptionTFunction);

  const title =
    artworkTitle !== null
      ? t('chat.resumption.title_with_artwork', { title: artworkTitle })
      : t('chat.resumption.title_fallback');
  const subtitle =
    museumName !== null
      ? t('chat.resumption.subtitle_with_museum', { museumName, timeAgo })
      : t('chat.resumption.subtitle_no_museum', { timeAgo });
  const a11yLabel =
    artworkTitle !== null && museumName !== null
      ? t('chat.resumption.a11y_label_with_artwork', { title: artworkTitle, museumName })
      : t('chat.resumption.a11y_label_fallback');

  const handleCardPress = (): void => {
    onResume?.(session.id);
  };

  const handleDismissPress = (event?: GestureResponderEvent): void => {
    // Stop the press event from bubbling to the outer card Pressable so the
    // dismiss tap never doubles as a resume tap (R19, AC17). RN's synthetic
    // event from `fireEvent.press` may be `undefined` in tests — guard so we
    // never crash the dismiss path.
    if (event && typeof event.stopPropagation === 'function') {
      event.stopPropagation();
    }
    onDismiss?.();
  };

  return (
    <Pressable
      testID="conversation-resumption-banner"
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint={t('chat.resumption.a11y_hint')}
      onPress={handleCardPress}
      style={[
        styles.root,
        {
          backgroundColor: theme.cardBackground,
          borderColor: theme.cardBorder,
        },
      ]}
    >
      <View style={[styles.thumb, { backgroundColor: theme.surface }]}>
        <Ionicons name="images-outline" size={20} color={theme.textSecondary} />
      </View>
      <View style={styles.content}>
        <Text
          testID="conversation-resumption-title"
          numberOfLines={1}
          style={[styles.title, { color: theme.textPrimary }]}
        >
          {title}
        </Text>
        <Text
          testID="conversation-resumption-subtitle"
          numberOfLines={1}
          style={[styles.subtitle, { color: theme.textSecondary }]}
        >
          {subtitle}
        </Text>
      </View>
      <Pressable
        testID="conversation-resumption-dismiss"
        accessibilityRole="button"
        accessibilityLabel={t('chat.resumption.a11y_dismiss')}
        onPress={handleDismissPress}
        hitSlop={12}
        style={styles.dismiss}
      >
        <Ionicons name="close" size={20} color={theme.textSecondary} />
      </Pressable>
    </Pressable>
  );
});

const THUMB_SIZE = 48;

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
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
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
