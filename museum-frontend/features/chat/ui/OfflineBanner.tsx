import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/shared/ui/ThemeContext';

interface OfflineBannerProps {
  pendingCount: number;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ pendingCount }) => {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.errorBackground }]}>
      <Ionicons name="cloud-offline-outline" size={16} color={theme.error} />
      <Text style={[styles.text, { color: theme.error }]}>
        You're offline{pendingCount > 0 ? ` · ${pendingCount} pending` : ''}
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
