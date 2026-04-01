import type React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/shared/ui/ThemeContext';

interface OfflineBannerProps {
  pendingCount: number;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ pendingCount }) => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  return (
    <View
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
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
  },
});
