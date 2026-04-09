import type React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useDataMode } from '@/features/chat/application/DataModeProvider';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens.semantic';
import { space } from '@/shared/ui/tokens.generated';

interface OfflineBannerProps {
  pendingCount: number;
  isOffline: boolean;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ pendingCount, isOffline }) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { isLowData } = useDataMode();

  if (!isOffline && !isLowData) return null;

  if (isOffline) {
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
  }

  return (
    <View
      style={[styles.container, { backgroundColor: theme.warningBackground }]}
      accessibilityRole="summary"
      accessibilityLabel={t('chat.lowDataActive')}
    >
      <Ionicons name="cellular-outline" size={16} color={theme.warningText} />
      <Text style={[styles.text, { color: theme.warningText }]}>{t('chat.lowDataActive')}</Text>
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
