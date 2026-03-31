import { useState } from 'react';
import { Alert, Share } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/context/AuthContext';
import { authService } from '@/features/auth/infrastructure/authApi';
import { authStorage, clearAccessToken } from '@/features/auth/infrastructure/authTokenStore';
import { AUTH_ROUTE } from '@/features/auth/routes';
import { getErrorMessage } from '@/shared/lib/errors';

/** Manages settings screen actions: biometric toggle, export, logout, delete account. */
export function useSettingsActions() {
  const { t } = useTranslation();
  const { logout, setIsAuthenticated } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const onToggleBiometric = async (
    value: boolean,
    enable: () => Promise<unknown>,
    disable: () => Promise<unknown>,
  ) => {
    if (value) {
      await enable();
    } else {
      await disable();
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const onExportData = async () => {
    setIsExporting(true);
    try {
      const data = await authService.exportData();
      await Share.share({ message: JSON.stringify(data, null, 2) });
    } catch (error) {
      Alert.alert(t('common.error'), getErrorMessage(error));
    } finally {
      setIsExporting(false);
    }
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
    Alert.alert(t('settings.delete_confirm_title'), t('settings.delete_confirm_body'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
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
          })();
        },
      },
    ]);
  };

  return {
    isSigningOut,
    isDeletingAccount,
    isExporting,
    onToggleBiometric,
    onExportData,
    onLogout,
    onDeleteAccount,
  };
}
