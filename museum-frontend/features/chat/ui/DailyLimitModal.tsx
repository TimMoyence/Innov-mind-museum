import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius, fontSize } from '@/shared/ui/tokens';

interface DailyLimitModalProps {
  visible: boolean;
  onDismiss: () => void;
}

/** Transparent modal shown when the user has exhausted their daily chat message allowance. */
export const DailyLimitModal = ({ visible, onDismiss }: DailyLimitModalProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <Modal
      animationType="fade"
      transparent
      statusBarTranslucent
      visible={visible}
      onRequestClose={onDismiss}
    >
      <SafeAreaView style={[styles.root, { backgroundColor: theme.modalOverlay }]}>
        <View style={[styles.card, { backgroundColor: theme.cardBackground }]}>
          <View style={[styles.iconCircle, { backgroundColor: theme.primaryTint }]}>
            <Ionicons name="time-outline" size={36} color={theme.primary} />
          </View>

          <Text style={[styles.title, { color: theme.textPrimary }]}>{t('dailyLimit.title')}</Text>

          <Text style={[styles.body, { color: theme.textSecondary }]}>{t('dailyLimit.body')}</Text>

          <View
            style={[
              styles.hintRow,
              { backgroundColor: theme.surface, borderColor: theme.cardBorder },
            ]}
          >
            <Ionicons name="sunny-outline" size={20} color={theme.primary} />
            <Text style={[styles.hintText, { color: theme.textSecondary }]}>
              {t('dailyLimit.reset_hint')}
            </Text>
          </View>

          <Pressable
            style={[styles.dismissButton, { backgroundColor: theme.primary }]}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={t('common.dismiss')}
          >
            <Text style={[styles.dismissText, { color: theme.primaryContrast }]}>
              {t('common.dismiss')}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: semantic.modal.padding,
  },
  card: {
    width: '100%',
    borderRadius: semantic.modal.radius,
    padding: semantic.modal.paddingLarge,
    alignItems: 'center',
    gap: semantic.screen.gap,
  },
  iconCircle: {
    width: space['18'],
    height: space['18'],
    borderRadius: radius['5xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    fontSize: fontSize['base-'],
    lineHeight: semantic.chat.iconSize,
    textAlign: 'center',
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2.5'],
    paddingHorizontal: semantic.card.padding,
    paddingVertical: semantic.card.paddingCompact,
    borderRadius: semantic.button.radius,
    borderWidth: semantic.input.borderWidth,
    width: '100%',
  },
  hintText: {
    flex: 1,
    fontSize: fontSize.sm,
  },
  dismissButton: {
    borderRadius: semantic.button.radius,
    paddingVertical: semantic.button.paddingY,
    paddingHorizontal: semantic.button.paddingX,
    alignItems: 'center',
    width: '100%',
  },
  dismissText: {
    fontSize: fontSize['lg-'],
    fontWeight: '700',
  },
});
