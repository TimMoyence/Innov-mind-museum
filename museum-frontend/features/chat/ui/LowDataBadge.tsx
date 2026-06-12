import type React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useDataMode } from '@/features/chat/application/DataModeProvider';
import { useConnectivity } from '@/shared/infrastructure/connectivity/useConnectivity';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens';

/**
 * Chat-scoped low-data badge (US-09, design §2.6) — replaces the buried
 * full-width yellow low-data bar (UFR-016, run
 * `undefined-network-detection-reliability`).
 *
 * Visibility (INV-12): renders iff `isLowData && isOnline` — never when the
 * resolved mode is `normal` (also the no-boot-flash case, US-09.6), never
 * while offline (the red global `OfflineBanner` has exclusive priority,
 * US-06.2). Auth gating is STRUCTURAL (US-09.2): the badge is mounted only by
 * `app/(stack)/chat/[sessionId].tsx`, the single screen hosting the chat
 * composer (design P-06), so it can never appear on an auth screen.
 *
 * Design (INV-14, light-blue Apple-glass direction): blue-tinted glass pill —
 * `theme.glassBackground` (primary.50-derived tint, never whitened) +
 * `theme.glassBorder` hairline, Ionicons-only affordance
 * (lib-docs/expo-vector-icons/PATTERNS.md §1/§2: named barrel import, labeled
 * interactive icon), internal spacing via `gap` (colored-container rule: no
 * vertical margin on direct children), logical `marginStart` (RTL,
 * lib-docs/react-native/PATTERNS.md §4), ≥44pt touch target (US-09.4).
 *
 * Tap opens the settings screen carrying `DataModeSettingsSection` (US-09.3)
 * via the imperative `router` singleton (repo convention —
 * lib-docs/expo-router/PATTERNS.md §2, e.g. `ChatMessageList.tsx:12`).
 */
export const LowDataBadge: React.FC = () => {
  const { isLowData } = useDataMode();
  const { isOnline } = useConnectivity();
  const { t } = useTranslation();
  const { theme } = useTheme();

  if (!isLowData || !isOnline) return null;

  return (
    <Pressable
      testID="low-data-badge"
      accessibilityRole="button"
      accessibilityLabel={t('chat.lowDataBadge.a11yLabel')}
      onPress={() => {
        router.push('/(stack)/settings');
      }}
      style={({ pressed }) => [
        styles.badge,
        {
          backgroundColor: theme.glassBackground,
          borderColor: theme.glassBorder,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Ionicons name="cellular-outline" size={14} color={theme.primary} />
      <Text style={[styles.label, { color: theme.textPrimary }]}>
        {t('chat.lowDataBadge.label')}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  badge: {
    // Compact pill, not a full-width bar (US-09.1).
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    // ≥44pt touch target (US-09.4 / INV-14).
    minHeight: 44,
    // Internal spacing via gap — NEVER a margin on a direct child of a
    // colored container (CLAUDE.md gotcha).
    gap: semantic.chat.gap,
    paddingVertical: semantic.badge.paddingY,
    paddingHorizontal: semantic.card.paddingCompact,
    borderRadius: semantic.badge.radiusFull,
    borderWidth: StyleSheet.hairlineWidth,
    // Logical side prop (RTL discipline) — physical marginLeft is forbidden.
    marginStart: semantic.screen.padding,
  },
  label: {
    fontSize: semantic.form.labelSize,
    fontWeight: '600',
  },
});
