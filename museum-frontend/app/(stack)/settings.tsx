import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/context/AuthContext';
import { useBiometricAuth } from '@/features/auth/application/useBiometricAuth';
import { authService } from '@/features/auth/infrastructure/authApi';
import { authStorage, clearAccessToken } from '@/features/auth/infrastructure/authTokenStore';
import { AUTH_ROUTE } from '@/features/auth/routes';
import { useRuntimeSettings } from '@/features/settings/application/useRuntimeSettings';
import { getErrorMessage } from '@/shared/lib/errors';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

type ThemeMode = 'system' | 'light' | 'dark';

const THEME_OPTION_KEYS: { value: ThemeMode; key: string }[] = [
  { value: 'system', key: 'settings.theme_system' },
  { value: 'light', key: 'settings.theme_light' },
  { value: 'dark', key: 'settings.theme_dark' },
];

type SettingsRoute =
  | '/(stack)/preferences'
  | '/(stack)/privacy'
  | '/(stack)/terms'
  | '/(stack)/support'
  | '/(stack)/guided-museum-mode'
  | '/(stack)/onboarding'
  | '/(tabs)/home';

/** Renders the settings hub with preferences summary, compliance links, account deletion, and sign-out actions. */
export default function SettingsScreen() {
  const { t } = useTranslation();
  const { logout, setIsAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  const { locale, museumMode, guideLevel, isLoading: isLoadingPrefs } = useRuntimeSettings();
  const { theme, mode, setMode } = useTheme();
  const { isAvailable: biometricAvailable, isEnabled: biometricEnabled, biometricLabel, enable: enableBiometric, disable: disableBiometric, isChecking: isBiometricChecking } = useBiometricAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const onToggleBiometric = async (value: boolean) => {
    if (value) {
      await enableBiometric();
    } else {
      await disableBiometric();
    }
  };

  const open = (path: SettingsRoute) => {
    router.push(path);
  };

  const onLogout = async () => {
    if (isSigningOut) {
      return;
    }

    setIsSigningOut(true);
    try {
      await logout();
    } finally {
      setIsSigningOut(false);
    }
  };

  const onDeleteAccount = () => {
    Alert.alert(
      t('settings.delete_confirm_title'),
      t('settings.delete_confirm_body'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          // eslint-disable-next-line @typescript-eslint/no-misused-promises -- void handled by caller
          onPress: async () => {
            setIsDeletingAccount(true);
            try {
              await authService.deleteAccount();
              await authStorage.clearRefreshToken().catch(() => undefined);
              clearAccessToken();
              setIsAuthenticated(false);
              router.replace(AUTH_ROUTE);
            } catch (error) {
              Alert.alert(t('common.error'), getErrorMessage(error));
            } finally {
              setIsDeletingAccount(false);
            }
          },
        },
      ],
    );
  };

  return (
    <LiquidScreen background={pickMuseumBackground(4)} contentStyle={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View style={styles.menuWrap}>
        <FloatingContextMenu
          actions={[
            {
              id: 'prefs',
              icon: 'options-outline',
              label: t('settings.preferences'),
              onPress: () => { open('/(stack)/preferences'); },
            },
            {
              id: 'privacy',
              icon: 'shield-checkmark-outline',
              label: t('settings.privacy_rgpd'),
              onPress: () => { open('/(stack)/privacy'); },
            },
            {
              id: 'support',
              icon: 'headset-outline',
              label: t('settings.support'),
              onPress: () => { open('/(stack)/support'); },
            },
          ]}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <GlassCard style={styles.heroCard} intensity={60}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>{t('settings.title')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t('settings.subtitle')}
          </Text>
          <Text style={[styles.buildNotice, { color: theme.primary }]}>
            {t('settings.env_note')}
          </Text>
        </GlassCard>

        <GlassCard style={styles.card} intensity={56}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{t('settings.appearance')}</Text>
          <View style={styles.themeRow}>
            {THEME_OPTION_KEYS.map((option) => (
              <Pressable
                key={option.value}
                style={[
                  styles.themeButton,
                  {
                    borderColor: theme.cardBorder,
                    backgroundColor: theme.surface,
                  },
                  mode === option.value && {
                    borderColor: theme.primary,
                    backgroundColor: theme.glassBackground,
                  },
                ]}
                onPress={() => { setMode(option.value); }}
                accessibilityRole="button"
                accessibilityLabel={t('a11y.settings.theme_button', { theme: option.key })}
                accessibilityState={{ selected: mode === option.value }}
              >
                <Text
                  style={[
                    styles.themeButtonText,
                    { color: theme.textSecondary },
                // eslint-disable-next-line react-native/no-inline-styles -- conditional bold
                    mode === option.value && { color: theme.primary, fontWeight: '700' },
                  ]}
                >
                  {t(option.key as 'settings.theme_system')}
                </Text>
              </Pressable>
            ))}
          </View>
        </GlassCard>

        <GlassCard style={styles.card} intensity={56}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{t('settings.security')}</Text>
          <View style={styles.biometricRow}>
            <View style={styles.biometricInfo}>
              <Text style={[styles.biometricLabel, { color: theme.textPrimary }]}>
                {t('settings.biometric_lock')}
              </Text>
              {biometricAvailable ? (
                <Text style={[styles.biometricHint, { color: theme.textSecondary }]}>
                  {biometricLabel}
                </Text>
              ) : (
                <Text style={[styles.biometricHint, { color: theme.textSecondary }]}>
                  {t('biometric.not_available')}
                </Text>
              )}
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={(v) => void onToggleBiometric(v)}
              disabled={!biometricAvailable || isBiometricChecking}
              trackColor={{ false: theme.cardBorder, true: theme.primary }}
            />
          </View>
        </GlassCard>

        <GlassCard style={styles.card} intensity={56}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{t('settings.current_preferences')}</Text>
          {isLoadingPrefs ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={theme.primary} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>{t('settings.loading_preferences')}</Text>
            </View>
          ) : (
            <>
              <Text style={[styles.metaLine, { color: theme.textPrimary }]}>{t('settings.locale_label', { locale })}</Text>
              <Text style={[styles.metaLine, { color: theme.textPrimary }]}>{t('settings.museum_mode_label', { mode: museumMode ? t('common.on') : t('common.off') })}</Text>
              <Text style={[styles.metaLine, { color: theme.textPrimary }]}>{t('settings.guide_level_label', { level: guideLevel })}</Text>
            </>
          )}
          <Pressable style={[styles.primaryButton, { backgroundColor: theme.primary }]} onPress={() => { open('/(stack)/preferences'); }} accessibilityRole="button" accessibilityLabel={t('a11y.settings.preferences')}>
            <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>{t('settings.open_preferences')}</Text>
          </Pressable>
        </GlassCard>

        <GlassCard style={styles.card} intensity={52}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{t('settings.guided_experience_title')}</Text>
          <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
            {t('settings.guided_experience_subtitle')}
          </Text>
          <Pressable
            style={[styles.secondaryButton, { borderColor: theme.cardBorder, backgroundColor: theme.surface }]}
            onPress={() => { open('/(stack)/guided-museum-mode'); }}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.settings.guided_mode')}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>{t('settings.guided_mode_info')}</Text>
          </Pressable>
        </GlassCard>

        <GlassCard style={styles.card} intensity={52}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{t('settings.compliance_title')}</Text>
          <View style={styles.linkList}>
            <Pressable style={[styles.linkRow, { borderColor: theme.cardBorder, backgroundColor: theme.surface }]} onPress={() => { open('/(stack)/privacy'); }} accessibilityRole="link" accessibilityLabel={t('a11y.settings.privacy_link')}>
              <Text style={[styles.linkTitle, { color: theme.textPrimary }]}>{t('settings.privacy_rgpd')}</Text>
              <Text style={[styles.linkDescription, { color: theme.textSecondary }]}>{t('settings.privacy_desc')}</Text>
            </Pressable>
            <Pressable style={[styles.linkRow, { borderColor: theme.cardBorder, backgroundColor: theme.surface }]} onPress={() => { open('/(stack)/terms'); }} accessibilityRole="link" accessibilityLabel={t('a11y.settings.terms_link')}>
              <Text style={[styles.linkTitle, { color: theme.textPrimary }]}>{t('settings.terms_of_service')}</Text>
              <Text style={[styles.linkDescription, { color: theme.textSecondary }]}>{t('settings.terms_desc')}</Text>
            </Pressable>
            <Pressable style={[styles.linkRow, { borderColor: theme.cardBorder, backgroundColor: theme.surface }]} onPress={() => { open('/(stack)/support'); }} accessibilityRole="link" accessibilityLabel={t('a11y.settings.support_link')}>
              <Text style={[styles.linkTitle, { color: theme.textPrimary }]}>{t('settings.support')}</Text>
              <Text style={[styles.linkDescription, { color: theme.textSecondary }]}>
                {t('settings.support_desc')}
              </Text>
            </Pressable>
            <Pressable style={[styles.linkRow, { borderColor: theme.cardBorder, backgroundColor: theme.surface }]} onPress={() => { open('/(stack)/onboarding'); }} accessibilityRole="link" accessibilityLabel={t('a11y.settings.onboarding_link')}>
              <Text style={[styles.linkTitle, { color: theme.textPrimary }]}>{t('settings.onboarding_help')}</Text>
              <Text style={[styles.linkDescription, { color: theme.textSecondary }]}>
                {t('settings.onboarding_desc')}
              </Text>
            </Pressable>
          </View>
        </GlassCard>

        <GlassCard style={[styles.dangerCard, { borderColor: theme.errorBackground }]} intensity={52}>
          <Text style={[styles.dangerTitle, { color: theme.error }]}>{t('settings.danger_zone')}</Text>
          <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
            {t('settings.danger_zone_desc')}
          </Text>
          <Pressable
            style={[styles.deleteButton, { backgroundColor: theme.danger }]}
            onPress={onDeleteAccount}
            disabled={isDeletingAccount}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.settings.delete_account')}
            accessibilityHint={t('a11y.settings.delete_account_hint')}
            accessibilityState={{ disabled: isDeletingAccount }}
          >
            {isDeletingAccount ? (
              <ActivityIndicator color={theme.primaryContrast} />
            ) : (
              <Text style={[styles.deleteButtonText, { color: theme.primaryContrast }]}>{t('settings.delete_account')}</Text>
            )}
          </Pressable>
        </GlassCard>

        <View style={styles.footerRow}>
          <Pressable style={[styles.secondaryButton, { borderColor: theme.cardBorder, backgroundColor: theme.surface }]} onPress={() => { open('/(tabs)/home'); }} accessibilityRole="button" accessibilityLabel={t('a11y.settings.back_home')}>
            <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>{t('settings.back_to_home')}</Text>
          </Pressable>

          <Pressable
            style={[styles.logoutButton, { borderColor: theme.error, backgroundColor: theme.errorBackground }]}
            onPress={() => void onLogout()}
            disabled={isSigningOut}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.settings.sign_out')}
            accessibilityHint={t('a11y.settings.sign_out_hint')}
            accessibilityState={{ disabled: isSigningOut }}
          >
            {isSigningOut ? (
              <ActivityIndicator color={theme.error} />
            ) : (
              <Text style={[styles.logoutButtonText, { color: theme.error }]}>{t('settings.sign_out')}</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  menuWrap: {
    alignItems: 'center',
    marginBottom: 10,
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
  subtitle: {
    lineHeight: 20,
    fontSize: 14,
  },
  buildNotice: {
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  card: {
    padding: 16,
    gap: 10,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: 17,
  },
  cardBody: {
    lineHeight: 20,
    fontSize: 13,
  },
  biometricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  biometricInfo: {
    flex: 1,
    gap: 2,
  },
  biometricLabel: {
    fontWeight: '600',
    fontSize: 14,
  },
  biometricHint: {
    fontSize: 12,
  },
  themeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  themeButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  themeButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
  },
  metaLine: {
    fontWeight: '600',
    fontSize: 13,
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
  linkList: {
    gap: 8,
  },
  linkRow: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  linkTitle: {
    fontWeight: '700',
    fontSize: 14,
  },
  linkDescription: {
    lineHeight: 18,
    fontSize: 12,
  },
  dangerCard: {
    padding: 16,
    gap: 10,
  },
  dangerTitle: {
    fontWeight: '700',
    fontSize: 17,
  },
  deleteButton: {
    marginTop: 2,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  deleteButtonText: {
    fontWeight: '700',
    fontSize: 14,
  },
  footerRow: {
    gap: 10,
  },
  logoutButton: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  logoutButtonText: {
    fontWeight: '700',
    fontSize: 15,
  },
});
