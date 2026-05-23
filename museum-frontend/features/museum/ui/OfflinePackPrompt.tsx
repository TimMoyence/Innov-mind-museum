import { Ionicons } from '@expo/vector-icons';
import { useCallback, type ReactElement } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { CityPackState } from '@/features/museum/application/useOfflinePacks';
import { LiquidButton } from '@/shared/ui/LiquidButton';
import { useTheme } from '@/shared/ui/ThemeContext';

export interface OfflinePackPromptProps {
  visible: boolean;
  cityName: string;
  packState: CityPackState;
  errorVisible: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onRetry: () => void;
  onDismiss: () => void;
  testID?: string;
}

const ONE_MB = 1024 * 1024;
const formatBytes = (bytes: number): string =>
  bytes < ONE_MB
    ? `${Math.round(bytes / 1024).toString()} KB`
    : `${(bytes / ONE_MB).toFixed(1)} MB`;

export function OfflinePackPrompt({
  visible,
  cityName,
  packState,
  errorVisible,
  onAccept,
  onDecline,
  onRetry,
  onDismiss,
  testID,
}: OfflinePackPromptProps): ReactElement {
  const { t } = useTranslation();
  const { theme } = useTheme();

  // Gate backdrop dismiss while a download is in flight — an accidental tap
  // outside the sheet must NOT silently abort the active download (audit #13).
  // Hardware back (`onRequestClose`) intentionally remains functional per the
  // Android convention "back = always exits the modal".
  const handleBackdropPress = useCallback(() => {
    if (packState.status === 'active') return;
    onDismiss();
  }, [packState.status, onDismiss]);

  const renderActions = (): ReactElement => {
    if (errorVisible) {
      return (
        <View style={styles.errorBlock} testID={testID ? `${testID}-error` : undefined}>
          <Text style={[styles.errorText, { color: theme.textPrimary }]}>
            {t('error.offlinePack.download_failed')}
          </Text>
          <View style={styles.actions}>
            <LiquidButton
              variant="secondary"
              size="md"
              label={t('museum.offlinePack.close')}
              onPress={onDismiss}
              testID={testID ? `${testID}-error-close` : undefined}
            />
            <LiquidButton
              variant="primary"
              size="md"
              label={t('museum.offlinePack.retry')}
              onPress={onRetry}
              iconName="refresh-outline"
              testID={testID ? `${testID}-retry` : undefined}
            />
          </View>
        </View>
      );
    }

    if (packState.status === 'active') {
      const percent = Math.round(packState.percentage);
      return (
        <View
          style={styles.progressBlock}
          accessibilityRole="progressbar"
          accessibilityValue={{ now: percent, min: 0, max: 100, text: `${percent.toString()}%` }}
          testID={testID ? `${testID}-progress` : undefined}
        >
          <ActivityIndicator color={theme.primary} />
          <Text style={[styles.percentage, { color: theme.textPrimary }]}>
            {`${percent.toString()}%`}
          </Text>
          <Text style={[styles.detail, { color: theme.textSecondary }]}>
            {t('museum.offlinePack.downloading')}
          </Text>
        </View>
      );
    }

    if (packState.status === 'complete') {
      return (
        <View style={styles.completeBlock} testID={testID ? `${testID}-complete` : undefined}>
          <Ionicons name="checkmark-circle-outline" size={28} color={theme.primary} />
          <Text style={[styles.completedTitle, { color: theme.textPrimary }]}>
            {t('museum.offlinePack.completed')}
          </Text>
          <Text style={[styles.detail, { color: theme.textSecondary }]}>
            {t('museum.offlinePack.completed_size', { size: formatBytes(packState.bytesOnDisk) })}
          </Text>
          <View style={styles.singleAction}>
            <LiquidButton
              variant="primary"
              size="md"
              label={t('museum.offlinePack.close')}
              onPress={onDismiss}
              testID={testID ? `${testID}-complete-close` : undefined}
            />
          </View>
        </View>
      );
    }

    return (
      <View style={styles.actions}>
        <LiquidButton
          variant="secondary"
          size="md"
          label={t('museum.offlinePack.decline')}
          onPress={onDecline}
          testID={testID ? `${testID}-decline` : undefined}
        />
        <LiquidButton
          variant="primary"
          size="md"
          label={t('museum.offlinePack.accept')}
          onPress={onAccept}
          iconName="cloud-download-outline"
          testID={testID ? `${testID}-accept` : undefined}
        />
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
      testID={testID}
    >
      <Pressable
        style={styles.backdrop}
        onPress={handleBackdropPress}
        accessibilityElementsHidden
      />
      <View
        style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}
      >
        <View style={[styles.handle, { backgroundColor: theme.textTertiary }]} />
        <Text style={[styles.title, { color: theme.textPrimary }]}>
          {t('museum.offlinePack.title', { cityName })}
        </Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          {t('museum.offlinePack.description')}
        </Text>
        <Text style={[styles.transparency, { color: theme.textTertiary }]}>
          {t('museum.offlinePack.transparency')}
        </Text>
        {renderActions()}
      </View>
    </Modal>
  );
}

const BACKDROP_COLOR = 'rgba(0,0,0,0.4)' as const;

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: BACKDROP_COLOR },
  sheet: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 8,
  },
  title: { fontSize: 18, fontWeight: '600' },
  description: { fontSize: 14, lineHeight: 20 },
  transparency: { fontSize: 12, lineHeight: 16 },
  detail: { fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  singleAction: { flexDirection: 'row', marginTop: 8 },
  progressBlock: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  percentage: {
    fontSize: 18,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  completeBlock: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  completedTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  errorBlock: {
    gap: 12,
    paddingTop: 4,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 20,
  },
});
