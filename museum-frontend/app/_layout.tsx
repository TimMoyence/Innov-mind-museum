import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, useNavigationContainerRef } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';

import { AuthProvider } from '@/context/AuthContext';
import { useProtectedRoute } from '@/features/auth/useProtectedRoute';
import { applyRuntimeSettings } from '@/features/settings/runtimeSettings';
import '@/shared/i18n/i18n';
import { I18nProvider } from '@/shared/i18n/I18nContext';
import { ThemeProvider, useTheme } from '@/shared/ui/ThemeContext';
import { ConnectivityProvider } from '@/shared/infrastructure/connectivity/ConnectivityProvider';
import {
  getApiConfigurationSnapshot,
  getStartupConfigurationError,
} from '@/shared/infrastructure/apiConfig';
import { StartupConfigurationErrorScreen } from '@/shared/ui/StartupConfigurationErrorScreen';

const sentryDsn =
  Platform.OS === 'android'
    ? process.env.EXPO_PUBLIC_SENTRY_DSN_ANDROID
    : process.env.EXPO_PUBLIC_SENTRY_DSN_IOS;

const reactNavigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

Sentry.init({
  dsn: sentryDsn || '',
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

function ThemedStatusBar() {
  const { isDark } = useTheme();
  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

/** Renders the root navigation layout with startup configuration validation, runtime settings bootstrap, and auth guard. */
function RootLayout() {
  const ref = useNavigationContainerRef();

  useEffect(() => {
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

    applyRuntimeSettings().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to apply runtime settings', error);
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
    <I18nProvider>
      <ThemeProvider>
        <AuthProvider>
          <ConnectivityProvider>
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
              <Stack.Screen name="(stack)/support" />
              <Stack.Screen name="(stack)/privacy" />
              <Stack.Screen name="(stack)/onboarding" />
              <Stack.Screen name="+not-found" />
            </Stack>
            <ThemedStatusBar />
            </AuthenticationGuard>
          </ConnectivityProvider>
        </AuthProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

export default Sentry.wrap(RootLayout);
