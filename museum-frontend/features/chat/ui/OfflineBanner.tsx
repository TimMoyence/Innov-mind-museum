import type React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space } from '@/shared/ui/tokens';

interface OfflineBannerProps {
  pendingCount: number;
  isOffline: boolean;
}

/**
 * Global OFFLINE banner — offline-only (INV-13, design §2.6).
 *
 * The former full-width yellow low-data variant was removed (UFR-016, run
 * `undefined-network-detection-reliability`): the low-data state is now
 * surfaced by the chat-scoped `LowDataBadge` (`features/chat/ui/LowDataBadge.tsx`).
 * This banner is INDIFFERENT to the resolved data mode — it renders iff
 * `isOffline` (availability axis only, US-06).
 */
export const OfflineBanner: React.FC<OfflineBannerProps> = ({ pendingCount, isOffline }) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  if (!isOffline) return null;

  return (
    <View
      testID="offline-banner"
      style={[styles.container, { backgroundColor: theme.errorBackground }]}
      accessibilityRole="alert"
      accessibilityLabel={t('offline.title')}
    >
      <Ionicons name="cloud-offline-outline" size={16} color={theme.error} />
      <Text style={[styles.text, { color: theme.error }]}>
        {t('offline.title')}
        {pendingCount > 0 ? ` · ${t('offline.pending', { count: pendingCount })}` : ''}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space['2'],
    paddingHorizontal: semantic.screen.padding,
    gap: semantic.chat.gap,
  },
  text: {
    fontSize: semantic.form.labelSize,
    fontWeight: '600',
  },
});
