import { useState } from 'react';
import { charCount, clampChars, TEXT_LIMITS } from '@musaium/shared/validation';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { authService } from '@/features/auth/infrastructure/authApi';
import { AUTH_ROUTE } from '@/features/auth/routes';
import { reportError } from '@/shared/observability/errorReporting';
import { semantic, space, fontSize } from '@/shared/ui/tokens';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

export default function ResetPasswordScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token?: string }>();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const goToLogin = () => {
    router.replace(AUTH_ROUTE);
  };

  if (!token) {
    return (
      <LiquidScreen
        background={pickMuseumBackground(5)}
        contentStyle={[styles.screen, styles.centered, { paddingTop: insets.top + 8 }]}
      >
        <GlassCard style={styles.card} intensity={60}>
          <Text style={[styles.title, { color: theme.textPrimary }]} accessibilityRole="header">
            {t('reset_password.title')}
          </Text>
          <Ionicons
            name="link"
            size={48}
            color={theme.textPrimary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text
            style={[styles.message, { color: theme.textPrimary }]}
            accessibilityLiveRegion="polite"
          >
            {t('reset_password.invalidToken')}
          </Text>
          <Pressable
            testID="reset-password-cta"
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            onPress={goToLogin}
            accessibilityRole="button"
            accessibilityLabel={t('reset_password.cta_login')}
          >
            <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>
              {t('reset_password.cta_login')}
            </Text>
          </Pressable>
        </GlassCard>
      </LiquidScreen>
    );
  }

  if (isSuccess) {
    return (
      <LiquidScreen
        background={pickMuseumBackground(5)}
        contentStyle={[styles.screen, styles.centered, { paddingTop: insets.top + 8 }]}
      >
        <GlassCard style={styles.card} intensity={60}>
          <Text style={[styles.title, { color: theme.textPrimary }]} accessibilityRole="header">
            {t('reset_password.title')}
          </Text>
          <Ionicons
            name="checkmark-circle"
            size={48}
            color={theme.success}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text
            testID="reset-password-success"
            style={[styles.message, { color: theme.textPrimary }]}
            accessibilityLiveRegion="polite"
          >
            {t('reset_password.success')}
          </Text>
          <Pressable
            testID="reset-password-cta"
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            onPress={goToLogin}
            accessibilityRole="button"
            accessibilityLabel={t('reset_password.cta_login')}
          >
            <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>
              {t('reset_password.cta_login')}
            </Text>
          </Pressable>
        </GlassCard>
      </LiquidScreen>
    );
  }

  const onSubmit = async () => {
    setError(null);

    if (charCount(newPassword) < TEXT_LIMITS.password.min) {
      setError(t('reset_password.error_short', { min: TEXT_LIMITS.password.min }));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t('reset_password.error_mismatch'));
      return;
    }

    setIsSubmitting(true);
    try {
      await authService.resetPassword(token, newPassword);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsSuccess(true);
    } catch (err) {
      reportError(err, { feature: 'reset-password' });
      setError(t('reset_password.error'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <LiquidScreen
      background={pickMuseumBackground(5)}
      contentStyle={[styles.screen, { paddingTop: insets.top + 8 }]}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <GlassCard style={styles.heroCard} intensity={60}>
          <Text style={[styles.title, { color: theme.textPrimary }]} accessibilityRole="header">
            {t('reset_password.title')}
          </Text>
        </GlassCard>

        <GlassCard style={styles.formCard} intensity={56}>
          <Text style={[styles.label, { color: theme.textPrimary }]} accessibilityRole="text">
            {t('reset_password.new')}
          </Text>
          <TextInput
            testID="reset-password-new"
            style={[
              styles.input,
              {
                color: theme.textPrimary,
                borderColor: theme.cardBorder,
                backgroundColor: theme.surface,
              },
            ]}
            value={newPassword}
            onChangeText={(text) => {
              setNewPassword(clampChars(text, TEXT_LIMITS.password.max));
            }}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            accessibilityLabel={t('reset_password.new')}
          />

          <Text style={[styles.label, { color: theme.textPrimary }]} accessibilityRole="text">
            {t('reset_password.confirm')}
          </Text>
          <TextInput
            testID="reset-password-confirm"
            style={[
              styles.input,
              {
                color: theme.textPrimary,
                borderColor: theme.cardBorder,
                backgroundColor: theme.surface,
              },
            ]}
            value={confirmPassword}
            onChangeText={(text) => {
              setConfirmPassword(clampChars(text, TEXT_LIMITS.password.max));
            }}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            accessibilityLabel={t('reset_password.confirm')}
          />

          {error ? <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text> : null}

          <Pressable
            testID="reset-password-submit"
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            onPress={() => void onSubmit()}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel={t('reset_password.submit')}
            accessibilityState={{ disabled: isSubmitting }}
          >
            <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>
              {t('reset_password.submit')}
            </Text>
          </Pressable>
        </GlassCard>
      </ScrollView>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: space['4.5'],
    paddingBottom: semantic.screen.padding,
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: semantic.screen.gapSmall,
    paddingBottom: space['5.5'],
  },
  heroCard: {
    padding: semantic.card.paddingLarge,
    gap: semantic.card.gapSmall,
  },
  card: {
    padding: semantic.card.paddingLarge,
    gap: semantic.card.gapSmall,
    alignItems: 'center',
  },
  formCard: {
    padding: semantic.card.padding,
    gap: semantic.form.gap,
  },
  title: {
    fontSize: fontSize['3xl'],
    fontWeight: '700',
    textAlign: 'auto',
  },
  message: {
    fontSize: fontSize.base,
    fontWeight: '600',
    textAlign: 'auto',
  },
  label: {
    fontWeight: '600',
    fontSize: fontSize.sm,
  },
  input: {
    borderWidth: semantic.input.borderWidth,
    borderRadius: semantic.input.radiusSmall,
    paddingVertical: semantic.button.paddingY,
    paddingHorizontal: space['3.5'],
    fontSize: fontSize.sm,
  },
  errorText: {
    fontSize: semantic.form.labelSize,
    fontWeight: '600',
  },
  primaryButton: {
    marginTop: space['0.5'],
    borderRadius: semantic.button.radiusSmall,
    alignItems: 'center',
    paddingVertical: semantic.button.paddingY,
    paddingHorizontal: space['5.5'],
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: semantic.button.fontSize,
  },
});
