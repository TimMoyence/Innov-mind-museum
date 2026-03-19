import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/context/AuthContext';
import { authStorage } from '@/features/auth/infrastructure/authStorage';
import { AUTH_ROUTE } from '@/features/auth/routes';
import { useRuntimeSettings } from '@/features/settings/application/useRuntimeSettings';
import { authService, clearAccessToken } from '@/services';
import { getErrorMessage } from '@/shared/lib/errors';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { liquidColors, pickMuseumBackground } from '@/shared/ui/liquidTheme';

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
  const { logout, setIsAuthenticated } = useAuth();
  const insets = useSafeAreaInsets();
  const { locale, museumMode, guideLevel, isLoading: isLoadingPrefs } = useRuntimeSettings();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

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
      'Delete Account',
      'This will permanently delete your account and all data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeletingAccount(true);
            try {
              await authService.deleteAccount();
              await authStorage.clearRefreshToken().catch(() => undefined);
              clearAccessToken();
              setIsAuthenticated(false);
              router.replace(AUTH_ROUTE);
            } catch (error) {
              Alert.alert('Error', getErrorMessage(error));
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
              label: 'Preferences',
              onPress: () => open('/(stack)/preferences'),
            },
            {
              id: 'privacy',
              icon: 'shield-checkmark-outline',
              label: 'Privacy',
              onPress: () => open('/(stack)/privacy'),
            },
            {
              id: 'support',
              icon: 'headset-outline',
              label: 'Support',
              onPress: () => open('/(stack)/support'),
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
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>
            Manage your Musaium preferences, privacy information, and support access.
          </Text>
          <Text style={styles.buildNotice}>
            Backend environment is build-driven (local/preview/production), not user-selectable.
          </Text>
        </GlassCard>

        <GlassCard style={styles.card} intensity={56}>
          <Text style={styles.cardTitle}>Current Preferences</Text>
          {isLoadingPrefs ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={liquidColors.primary} />
              <Text style={styles.loadingText}>Loading preferences…</Text>
            </View>
          ) : (
            <>
              <Text style={styles.metaLine}>Locale: {locale}</Text>
              <Text style={styles.metaLine}>Guided mode: {museumMode ? 'On' : 'Off'}</Text>
              <Text style={styles.metaLine}>Guide level: {guideLevel}</Text>
            </>
          )}
          <Pressable style={styles.primaryButton} onPress={() => open('/(stack)/preferences')}>
            <Text style={styles.primaryButtonText}>Open Preferences</Text>
          </Pressable>
        </GlassCard>

        <GlassCard style={styles.card} intensity={52}>
          <Text style={styles.cardTitle}>Guided Museum Experience</Text>
          <Text style={styles.cardBody}>
            Understand how guided mode changes explanations, next-stop suggestions, and response depth
            during museum visits.
          </Text>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => open('/(stack)/guided-museum-mode')}
          >
            <Text style={styles.secondaryButtonText}>Guided Museum Mode Info</Text>
          </Pressable>
        </GlassCard>

        <GlassCard style={styles.card} intensity={52}>
          <Text style={styles.cardTitle}>Compliance & Help</Text>
          <View style={styles.linkList}>
            <Pressable style={styles.linkRow} onPress={() => open('/(stack)/privacy')}>
              <Text style={styles.linkTitle}>Privacy (RGPD)</Text>
              <Text style={styles.linkDescription}>Read data processing, rights, and legal contacts.</Text>
            </Pressable>
            <Pressable style={styles.linkRow} onPress={() => open('/(stack)/terms')}>
              <Text style={styles.linkTitle}>Terms of Service</Text>
              <Text style={styles.linkDescription}>Read our terms and conditions of use.</Text>
            </Pressable>
            <Pressable style={styles.linkRow} onPress={() => open('/(stack)/support')}>
              <Text style={styles.linkTitle}>Support</Text>
              <Text style={styles.linkDescription}>
                Contact support through Instagram or Telegram channels.
              </Text>
            </Pressable>
            <Pressable style={styles.linkRow} onPress={() => open('/(stack)/onboarding')}>
              <Text style={styles.linkTitle}>Onboarding Help</Text>
              <Text style={styles.linkDescription}>
                Revisit usage flow, practical tips, and help shortcuts.
              </Text>
            </Pressable>
          </View>
        </GlassCard>

        <GlassCard style={styles.dangerCard} intensity={52}>
          <Text style={styles.dangerTitle}>Danger Zone</Text>
          <Text style={styles.cardBody}>
            Permanently delete your account and all associated data. This action cannot be undone.
          </Text>
          <Pressable
            style={styles.deleteButton}
            onPress={onDeleteAccount}
            disabled={isDeletingAccount}
          >
            {isDeletingAccount ? (
              <ActivityIndicator color='#FFFFFF' />
            ) : (
              <Text style={styles.deleteButtonText}>Delete Account</Text>
            )}
          </Pressable>
        </GlassCard>

        <View style={styles.footerRow}>
          <Pressable style={styles.secondaryButton} onPress={() => open('/(tabs)/home')}>
            <Text style={styles.secondaryButtonText}>Back to Home</Text>
          </Pressable>

          <Pressable
            style={styles.logoutButton}
            onPress={() => void onLogout()}
            disabled={isSigningOut}
          >
            {isSigningOut ? (
              <ActivityIndicator color='#B91C1C' />
            ) : (
              <Text style={styles.logoutButtonText}>Sign out</Text>
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
    color: liquidColors.textPrimary,
  },
  subtitle: {
    color: liquidColors.textSecondary,
    lineHeight: 20,
    fontSize: 14,
  },
  buildNotice: {
    color: '#1E3A8A',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  card: {
    padding: 16,
    gap: 10,
  },
  cardTitle: {
    color: liquidColors.textPrimary,
    fontWeight: '700',
    fontSize: 17,
  },
  cardBody: {
    color: liquidColors.textSecondary,
    lineHeight: 20,
    fontSize: 13,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    color: liquidColors.textSecondary,
    fontSize: 13,
  },
  metaLine: {
    color: liquidColors.textPrimary,
    fontWeight: '600',
    fontSize: 13,
  },
  primaryButton: {
    marginTop: 2,
    borderRadius: 12,
    backgroundColor: liquidColors.primary,
    alignItems: 'center',
    paddingVertical: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  secondaryButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.5)',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.68)',
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    color: liquidColors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  linkList: {
    gap: 8,
  },
  linkRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.32)',
    backgroundColor: 'rgba(255,255,255,0.58)',
    padding: 12,
    gap: 4,
  },
  linkTitle: {
    color: liquidColors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  linkDescription: {
    color: liquidColors.textSecondary,
    lineHeight: 18,
    fontSize: 12,
  },
  dangerCard: {
    padding: 16,
    gap: 10,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  dangerTitle: {
    color: '#B91C1C',
    fontWeight: '700',
    fontSize: 17,
  },
  deleteButton: {
    marginTop: 2,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    paddingVertical: 12,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  footerRow: {
    gap: 10,
  },
  logoutButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(254,242,242,0.82)',
  },
  logoutButtonText: {
    color: '#B91C1C',
    fontWeight: '700',
    fontSize: 15,
  },
});
