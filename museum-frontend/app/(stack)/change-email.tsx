import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { authService } from '@/features/auth/infrastructure/authApi';
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
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 12,
    paddingBottom: 22,
  },
  heroCard: {
    padding: 18,
    gap: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
  },
  card: {
    padding: 16,
    gap: 10,
  },
  label: {
    fontWeight: '600',
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
  },
  successText: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  primaryButton: {
    marginTop: 2,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    fontWeight: '700',
    fontSize: 14,
  },
});
