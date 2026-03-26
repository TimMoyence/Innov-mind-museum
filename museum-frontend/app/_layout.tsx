import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, useNavigationContainerRef } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { useBiometricAuth } from '@/features/auth/application/useBiometricAuth';
import { BiometricLockScreen } from '@/features/auth/ui/BiometricLockScreen';
import { useProtectedRoute } from '@/features/auth/useProtectedRoute';
import { applyRuntimeSettings, saveDefaultLocale } from '@/features/settings/runtimeSettings';
import i18n from '@/shared/i18n/i18n';
import { I18nProvider, setOnLanguageChange } from '@/shared/i18n/I18nContext';
import { setErrorTranslate } from '@/shared/lib/errors';

// Wire i18n into error message formatting so getErrorMessage() returns localised strings.
// The key is always a valid `error.*` path defined in our translation files.
setErrorTranslate((key, opts) =>
  i18n.t(key as 'error.network', opts),
);
import { ThemeProvider, useTheme } from '@/shared/ui/ThemeContext';
import { ConnectivityProvider } from '@/shared/infrastructure/connectivity/ConnectivityProvider';
import {
  getApiConfigurationSnapshot,
  getStartupConfigurationError,
} from '@/shared/infrastructure/apiConfig';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { StartupConfigurationErrorScreen } from '@/shared/ui/StartupConfigurationErrorScreen';

const sentryDsn: string | undefined =
  Platform.OS === 'android'
    ? (process.env.EXPO_PUBLIC_SENTRY_DSN_ANDROID as string | undefined)
    : (process.env.EXPO_PUBLIC_SENTRY_DSN_IOS as string | undefined);

const reactNavigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

Sentry.init({
  dsn: sentryDsn ?? '',
  enabled: !!sentryDsn,
  environment: __DEV__ ? 'development' : 'production',
  tracesSampleRate: 0.2,
  integrations: [
    Sentry.reactNativeTracingIntegration(),
    reactNavigationIntegration,
  ],
  enableAutoPerformanceTracing: true,
});

function AuthenticationGuard({ children }: { children: ReactNode }) {
  useProtectedRoute();
  return <>{children}</>;
}

function BiometricGate({ children }: { children: ReactNode }) {
  const { isBiometricLocked, unlockBiometric } = useAuth();
  const { authenticate, biometricLabel } = useBiometricAuth();
  const [failed, setFailed] = useState(false);

  const handleUnlock = async () => {
    setFailed(false);
    const success = await authenticate();
    if (success) {
      unlockBiometric();
    } else {
      setFailed(true);
    }
  };

  if (isBiometricLocked) {
    return (
      <BiometricLockScreen
        biometricLabel={biometricLabel}
        onUnlock={() => void handleUnlock()}
        failed={failed}
      />
    );
  }

  return <>{children}</>;
}

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

/** Renders the root navigation layout with startup configuration validation, runtime settings bootstrap, and auth guard. */
function RootLayout() {
  const ref = useNavigationContainerRef();

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ref guard
    if (ref) {
      reactNavigationIntegration.registerNavigationContainer(ref);
    }
  }, [ref]);

  const startupConfiguration = useMemo(() => {
    return {
      error: getStartupConfigurationError(),
      snapshot: getApiConfigurationSnapshot(),
    };
  }, []);
  const [runtimeStartupError, setRuntimeStartupError] = useState<Error | null>(
    null,
  );

  useEffect(() => {
    if (Platform.OS === 'ios') {
      import('expo-tracking-transparency').then(({ requestTrackingPermissionsAsync }) => {
        void requestTrackingPermissionsAsync();
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (startupConfiguration.error) {
      return;
    }

    setOnLanguageChange((lang) => void saveDefaultLocale(lang));

    applyRuntimeSettings().catch((error) => {
      setRuntimeStartupError(
        error instanceof Error
          ? error
          : new Error('Failed to apply runtime settings'),
      );
    });
  }, [startupConfiguration.error]);

  if (startupConfiguration.error) {
    return (
      <StartupConfigurationErrorScreen
        error={startupConfiguration.error}
        snapshot={startupConfiguration.snapshot}
      />
    );
  }

  if (runtimeStartupError) {
    return (
      <StartupConfigurationErrorScreen
        error={runtimeStartupError}
        snapshot={startupConfiguration.snapshot}
      />
    );
  }

  return (
    <ErrorBoundary>
    <I18nProvider>
      <ThemeProvider>
        <AuthProvider>
          <ConnectivityProvider>
            <BiometricGate>
            <AuthenticationGuard>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="auth" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="(stack)/chat/[sessionId]"
                options={{
                  headerShown: false,
                  gestureEnabled: true,
                }}
              />
              <Stack.Screen name="(stack)/settings" />
              <Stack.Screen name="(stack)/preferences" />
              <Stack.Screen name="(stack)/guided-museum-mode" />
              <Stack.Screen name="(stack)/discover" />
              <Stack.Screen name="(stack)/museum-detail" />
              <Stack.Screen name="(stack)/support" />
              <Stack.Screen name="(stack)/privacy" />
              <Stack.Screen name="(stack)/terms" />
              <Stack.Screen name="(stack)/onboarding" />
              <Stack.Screen name="+not-found" />
            </Stack>
            <ThemedStatusBar />
            </AuthenticationGuard>
            </BiometricGate>
          </ConnectivityProvider>
        </AuthProvider>
      </ThemeProvider>
    </I18nProvider>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);
