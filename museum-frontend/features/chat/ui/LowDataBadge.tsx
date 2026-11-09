import type React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useDataMode } from '@/features/chat/application/DataModeProvider';
import { useConnectivity } from '@/shared/infrastructure/connectivity/useConnectivity';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens';

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
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    gap: semantic.chat.gap,
    paddingVertical: semantic.badge.paddingY,
    paddingHorizontal: semantic.card.paddingCompact,
    borderRadius: semantic.badge.radiusFull,
    borderWidth: StyleSheet.hairlineWidth,
    marginStart: semantic.screen.padding,
  },
  label: {
    fontSize: semantic.form.labelSize,
    fontWeight: '600',
  },
});
