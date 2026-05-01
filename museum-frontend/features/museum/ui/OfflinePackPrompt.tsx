import type { ReactElement } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LiquidButton } from '@/shared/ui/LiquidButton';
import { useTheme } from '@/shared/ui/ThemeContext';
import type { CityId } from '@/features/museum/infrastructure/cityCatalog';

export interface OfflinePackPromptProps {
  visible: boolean;
  cityId: CityId;
  cityName: string;
  onAccept: () => void;
  onDecline: () => void;
  testID?: string;
}

export function OfflinePackPrompt({
  visible,
  cityId: _cityId,
  cityName,
  onAccept,
  onDecline,
  testID,
}: OfflinePackPromptProps): ReactElement {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDecline}
      testID={testID}
    >
      <Pressable style={styles.backdrop} onPress={onDecline} accessibilityElementsHidden />
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
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
});
