import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { authService } from '@/features/auth/infrastructure/authApi';
import { semantic, space, fontSize } from '@/shared/ui/tokens';
import { getErrorMessage } from '@/shared/lib/errors';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

/** Screen allowing the authenticated user to request an email change. */
export default function ChangeEmailScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onSubmit = async () => {
    setError(null);

    setIsSubmitting(true);
    try {
      await authService.changeEmail(newEmail, password);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSuccess(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <LiquidScreen
      background={pickMuseumBackground(6)}
      contentStyle={[styles.screen, { paddingTop: insets.top + 8 }]}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <GlassCard style={styles.heroCard} intensity={60}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>
            {t('change_email.title')}
          </Text>
        </GlassCard>

        {success ? (
          <GlassCard style={styles.card} intensity={56}>
            <Text style={[styles.successText, { color: theme.primary }]}>
              {t('change_email.success')}
            </Text>
          </GlassCard>
        ) : (
          <GlassCard style={styles.card} intensity={56}>
            <Text style={[styles.label, { color: theme.textPrimary }]} accessibilityRole="text">
              {t('change_email.new_email')}
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: theme.textPrimary,
                  borderColor: theme.cardBorder,
                  backgroundColor: theme.surface,
                },
              ]}
              value={newEmail}
              onChangeText={setNewEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              accessibilityLabel={t('change_email.new_email')}
              accessibilityHint={t('change_email.new_email')}
            />

            <Text style={[styles.label, { color: theme.textPrimary }]} accessibilityRole="text">
              {t('change_email.password')}
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: theme.textPrimary,
                  borderColor: theme.cardBorder,
                  backgroundColor: theme.surface,
                },
              ]}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              accessibilityLabel={t('change_email.password')}
              accessibilityHint={t('change_email.password')}
            />

            {error ? <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text> : null}

            <Pressable
              style={[styles.primaryButton, { backgroundColor: theme.primary }]}
              onPress={() => void onSubmit()}
              disabled={isSubmitting || !newEmail || !password}
              accessibilityRole="button"
              accessibilityLabel={t('change_email.submit')}
              accessibilityState={{ disabled: isSubmitting }}
            >
              <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>
                {t('change_email.submit')}
              </Text>
            </Pressable>
          </GlassCard>
        )}

        <Pressable
          style={[
            styles.secondaryButton,
            { borderColor: theme.cardBorder, backgroundColor: theme.surface },
          ]}
          onPress={() => {
            router.back();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>
            {t('common.back')}
          </Text>
        </Pressable>
      </ScrollView>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: space['4.5'],
    paddingBottom: semantic.screen.padding,
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
  title: {
    fontSize: fontSize['3xl'],
    fontWeight: '700',
  },
  card: {
    padding: semantic.card.padding,
    gap: semantic.form.gap,
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
  successText: {
    fontSize: fontSize['base-'],
    fontWeight: '600',
    lineHeight: space['5.5'],
  },
  primaryButton: {
    marginTop: space['0.5'],
    borderRadius: semantic.button.radiusSmall,
    alignItems: 'center',
    paddingVertical: semantic.button.paddingY,
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: semantic.button.fontSize,
  },
  secondaryButton: {
    borderRadius: semantic.button.radiusSmall,
    borderWidth: semantic.input.borderWidth,
    paddingVertical: semantic.button.paddingY,
    alignItems: 'center',
    paddingHorizontal: semantic.input.paddingCompact,
  },
  secondaryButtonText: {
    fontWeight: '700',
    fontSize: semantic.button.fontSize,
  },
});
