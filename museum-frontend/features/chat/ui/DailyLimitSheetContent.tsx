import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { LiquidButton } from '@/shared/ui/LiquidButton';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius, fontSize } from '@/shared/ui/tokens';

interface DailyLimitSheetContentProps {
  close: () => void;
  onDismiss?: () => void;
}

/**
 * Bottom-sheet content (centered card, blocking) shown when the user has
 * exhausted their daily chat message allowance. Mounted by
 * `<BottomSheetRouter>` for the `daily-limit` route. Replaces the previous
 * `<DailyLimitModal>` (Modal wrapper stripped).
 */
export const DailyLimitSheetContent = ({ close, onDismiss }: DailyLimitSheetContentProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  const handleDismiss = (): void => {
    onDismiss?.();
    close();
  };

  return (
    <View style={styles.card}>
      <View style={[styles.iconCircle, { backgroundColor: theme.primaryTint }]}>
        <Ionicons name="time-outline" size={36} color={theme.primary} />
      </View>

      <Text style={[styles.title, { color: theme.textPrimary }]}>{t('dailyLimit.title')}</Text>

      <Text style={[styles.body, { color: theme.textSecondary }]}>{t('dailyLimit.body')}</Text>

      <View
        style={[styles.hintRow, { backgroundColor: theme.surface, borderColor: theme.cardBorder }]}
      >
        <Ionicons name="sunny-outline" size={20} color={theme.primary} />
        <Text style={[styles.hintText, { color: theme.textSecondary }]}>
          {t('dailyLimit.reset_hint')}
        </Text>
      </View>

      <LiquidButton
        label={t('common.dismiss')}
        onPress={handleDismiss}
        variant="primary"
        size="lg"
        accessibilityLabel={t('common.dismiss')}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '100%',
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
});
