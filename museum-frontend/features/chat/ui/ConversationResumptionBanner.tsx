import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { radius, semantic, space } from '@/shared/ui/tokens';

import type { ResumableSession } from '@/features/chat/application/useResumableSession';

type ResumptionTFunction = (key: string, opts?: { count: number }) => string;

const ONE_MINUTE_MS = 60_000;
const ONE_HOUR_MS = 3_600_000;
const ONE_DAY_MS = 86_400_000;

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
  readonly session: ResumableSession | null;
  readonly onResume?: (sessionId: string) => void;
  readonly onDismiss?: () => void;
}

export const ConversationResumptionBanner = React.memo(function ConversationResumptionBanner({
  session,
  onResume,
  onDismiss,
}: ConversationResumptionBannerProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
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
