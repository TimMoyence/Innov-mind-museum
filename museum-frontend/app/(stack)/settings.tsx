import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useBiometricAuth } from '@/features/auth/application/useBiometricAuth';
import { useMe } from '@/features/auth/application/useMe';
import { useRuntimeSettings } from '@/features/settings/application/useRuntimeSettings';
import { useSettingsActions } from '@/features/settings/application/useSettingsActions';
import { SettingsThemeCard } from '@/features/settings/ui/SettingsThemeCard';
import { SettingsSecurityCard } from '@/features/settings/ui/SettingsSecurityCard';
import { SettingsPrivacyCard } from '@/features/settings/ui/SettingsPrivacyCard';
import { SettingsAccessibilityCard } from '@/features/settings/ui/SettingsAccessibilityCard';
import { DataModeSettingsSection } from '@/features/settings/ui/DataModeSettingsSection';
import { SettingsComplianceLinks } from '@/features/settings/ui/SettingsComplianceLinks';
import { SettingsDangerZone } from '@/features/settings/ui/SettingsDangerZone';
import { VoicePreferenceSection } from '@/features/settings/ui/VoicePreferenceSection';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { semantic, space, fontSize } from '@/shared/ui/tokens';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { LANGUAGE_OPTIONS } from '@/shared/config/supportedLocales';
import { useTheme } from '@/shared/ui/ThemeContext';

type SettingsRoute =
  | '/(stack)/preferences'
  | '/(stack)/privacy'
  | '/(stack)/terms'
  | '/(stack)/support'
  | '/(stack)/guided-museum-mode'
  | '/(stack)/offline-maps'
  | '/(stack)/onboarding'
  | '/(stack)/reviews'
  | '/(tabs)/home';

/** Renders the settings hub with preferences summary, compliance links, account deletion, and sign-out actions. */
export default function SettingsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { locale, museumMode, guideLevel, isLoading: isLoadingPrefs } = useRuntimeSettings();
  const { data: profile } = useMe();
  const { theme, mode, setMode } = useTheme();
  const {
    isAvailable: biometricAvailable,
    isEnabled: biometricEnabled,
    biometricLabel,
    enable: enableBiometric,
    disable: disableBiometric,
    isChecking: isBiometricChecking,
  } = useBiometricAuth();

  const {
    isSigningOut,
    isDeletingAccount,
    isExporting,
    onToggleBiometric,
    onExportData,
    onLogout,
    onDeleteAccount,
  } = useSettingsActions();

  const open = (path: SettingsRoute) => {
    router.push(path);
  };

  return (
    <LiquidScreen
      background={pickMuseumBackground(4)}
      contentStyle={[styles.screen, { paddingTop: insets.top + 8 }]}
    >
      <View style={styles.menuWrap}>
        <FloatingContextMenu
          scrollable
          actions={[
            {
              id: 'prefs',
              icon: 'options-outline',
              label: t('settings.preferences'),
              onPress: () => {
                open('/(stack)/preferences');
              },
            },
            {
              id: 'privacy',
              icon: 'shield-checkmark-outline',
              label: t('settings.privacy_short'),
              onPress: () => {
                open('/(stack)/privacy');
              },
            },
            {
              id: 'support',
              icon: 'headset-outline',
              label: t('settings.support'),
              onPress: () => {
                open('/(stack)/support');
              },
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

        <SettingsThemeCard mode={mode} onSetMode={setMode} />

        <SettingsSecurityCard
          biometricAvailable={biometricAvailable}
          biometricEnabled={biometricEnabled}
          biometricLabel={biometricLabel}
          isBiometricChecking={isBiometricChecking}
          onToggleBiometric={(v) => void onToggleBiometric(v, enableBiometric, disableBiometric)}
        />

        <GlassCard style={styles.card} intensity={56}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
            {t('settings.current_preferences')}
          </Text>
          {isLoadingPrefs ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={theme.primary} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
                {t('settings.loading_preferences')}
              </Text>
            </View>
          ) : (
            <>
              <Text style={[styles.metaLine, { color: theme.textPrimary }]}>
                {t('settings.locale_label', {
                  locale: LANGUAGE_OPTIONS.find((o) => o.code === locale)?.nativeLabel ?? locale,
                })}
              </Text>
              <Text style={[styles.metaLine, { color: theme.textPrimary }]}>
                {t('settings.museum_mode_label', {
                  mode: museumMode ? t('common.on') : t('common.off'),
                })}
              </Text>
              <Text style={[styles.metaLine, { color: theme.textPrimary }]}>
                {t('settings.guide_level_label', { level: guideLevel })}
              </Text>
            </>
          )}
          <Pressable
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            onPress={() => {
              open('/(stack)/preferences');
            }}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.settings.preferences')}
          >
            <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>
              {t('settings.open_preferences')}
            </Text>
          </Pressable>
        </GlassCard>

        <GlassCard style={styles.card} intensity={52}>
          <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
            {t('settings.guided_experience_title')}
          </Text>
          <Text style={[styles.cardBody, { color: theme.textSecondary }]}>
            {t('settings.guided_experience_subtitle')}
          </Text>
          <Pressable
            style={[
              styles.secondaryButton,
              { borderColor: theme.cardBorder, backgroundColor: theme.surface },
            ]}
            onPress={() => {
              open('/(stack)/guided-museum-mode');
            }}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.settings.guided_mode')}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>
              {t('settings.guided_mode_info')}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.secondaryButton,
              { borderColor: theme.cardBorder, backgroundColor: theme.surface },
            ]}
            onPress={() => {
              open('/(stack)/offline-maps');
            }}
            accessibilityRole="button"
            accessibilityLabel={t('offlineMaps.title')}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>
              {t('offlineMaps.open_cta')}
            </Text>
          </Pressable>
        </GlassCard>

        <SettingsPrivacyCard />

        <SettingsAccessibilityCard />

        <VoicePreferenceSection currentVoice={profile?.user.ttsVoice ?? null} />

        <DataModeSettingsSection />

        <SettingsComplianceLinks
          onNavigate={open}
          onExportData={() => void onExportData()}
          isExporting={isExporting}
        />

        <Pressable
          style={[styles.primaryButton, { backgroundColor: theme.primary }]}
          onPress={() => {
            open('/(stack)/reviews');
          }}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.settings.rate_musaium')}
        >
          <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>
            {t('settings.rate_musaium')}
          </Text>
        </Pressable>

        <SettingsDangerZone
          onDeleteAccount={onDeleteAccount}
          isDeletingAccount={isDeletingAccount}
        />

        <View style={styles.footerRow}>
          <Pressable
            style={[
              styles.secondaryButton,
              { borderColor: theme.cardBorder, backgroundColor: theme.surface },
            ]}
            onPress={() => {
              open('/(tabs)/home');
            }}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.settings.back_home')}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.textPrimary }]}>
              {t('settings.back_to_home')}
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.logoutButton,
              { borderColor: theme.error, backgroundColor: theme.errorBackground },
            ]}
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
              <Text style={[styles.logoutButtonText, { color: theme.error }]}>
                {t('settings.sign_out')}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: semantic.card.paddingLarge,
    paddingBottom: semantic.card.padding,
  },
  menuWrap: {
    alignItems: 'center',
    marginBottom: space['2.5'],
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
  subtitle: {
    lineHeight: space['5'],
    fontSize: fontSize.sm,
  },
  buildNotice: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    lineHeight: semantic.card.paddingLarge,
  },
  card: {
    padding: semantic.card.padding,
    gap: space['2.5'],
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: fontSize['lg-'],
  },
  cardBody: {
    lineHeight: space['5'],
    fontSize: semantic.form.labelSize,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: semantic.card.gapSmall,
  },
  loadingText: {
    fontSize: semantic.form.labelSize,
  },
  metaLine: {
    fontWeight: '600',
    fontSize: semantic.form.labelSize,
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
    paddingHorizontal: semantic.card.paddingCompact,
  },
  secondaryButtonText: {
    fontWeight: '700',
    fontSize: semantic.button.fontSize,
  },
  footerRow: {
    gap: space['2.5'],
  },
  logoutButton: {
    borderRadius: semantic.button.radiusSmall,
    borderWidth: semantic.input.borderWidth,
    paddingVertical: semantic.button.paddingY,
    alignItems: 'center',
  },
  logoutButtonText: {
    fontWeight: '700',
    fontSize: fontSize['base-'],
  },
});
