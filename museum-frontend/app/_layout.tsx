import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { Stack, useNavigationContainerRef } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';

import {
  persistBuster,
  persistMaxAge,
  queryClient,
  queryPersister,
  shouldDehydrateQuery,
} from '@/shared/data/queryClient';
import { initSentry, reactNavigationIntegration } from '@/shared/observability/sentry-init';
import { logInitPhase } from '@/shared/observability/init-phase-breadcrumbs';

import '@/features/museum/infrastructure/mapLibreBootstrap';

import { AuthProvider } from '@/features/auth/application/AuthContext';
import { BiometricGate } from '@/features/auth/ui/BiometricGate';
import { useProtectedRoute } from '@/features/auth/useProtectedRoute';
import { useArtKeywordsSync } from '@/features/art-keywords/application/useArtKeywordsSync';
import { applyRuntimeSettings, saveDefaultLocale } from '@/features/settings/runtimeSettings';
import i18n from '@/shared/i18n/i18n';
import { I18nProvider, setOnLanguageChange } from '@/shared/i18n/I18nContext';
import { setErrorTranslate } from '@/shared/lib/errors';

// Wire i18n into error message formatting so getErrorMessage() returns localised strings.
// The key is always a valid `error.*` path defined in our translation files.
setErrorTranslate((key, opts) => i18n.t(key as 'error.network', opts));
import { DataModeProvider } from '@/features/chat/application/DataModeProvider';
import { ThemeProvider, useTheme } from '@/shared/ui/ThemeContext';
import { ConnectivityProvider } from '@/shared/infrastructure/connectivity/ConnectivityProvider';
import {
  getApiConfigurationSnapshot,
  getStartupConfigurationError,
} from '@/shared/infrastructure/apiConfig';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { StartupConfigurationErrorScreen } from '@/shared/ui/StartupConfigurationErrorScreen';
import { initCertPinning } from '@/shared/infrastructure/cert-pinning-init';

const readEnvString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const sentryDsn: string | undefined =
  Platform.OS === 'android'
    ? readEnvString(process.env.EXPO_PUBLIC_SENTRY_DSN_ANDROID)
    : readEnvString(process.env.EXPO_PUBLIC_SENTRY_DSN_IOS);

initSentry(sentryDsn);
logInitPhase('sentry.initialized', { platform: Platform.OS, hasDsn: Boolean(sentryDsn) });

// Cert pinning init runs PRE-axios so the first network request is pinned
// when the env flag and kill-switch agree. The env defaults to false, so
// V1 launches ship un-pinned; flip `EXPO_PUBLIC_CERT_PINNING_ENABLED=true`
// only after capturing real SPKI hashes (see ADR-031, CERT_ROTATION runbook).
// Fire-and-forget: a slow kill-switch fetch must not block the React tree.
void initCertPinning({ apiBaseUrl: getApiConfigurationSnapshot().resolvedBaseUrl })
  .then((outcome) => {
    logInitPhase('certPinning.resolved', outcome);
  })
  .catch((error: unknown) => {
    logInitPhase('certPinning.error', {
      message: error instanceof Error ? error.message : String(error),
    });
  });

function AuthenticationGuard({ children }: { children: ReactNode }) {
  useProtectedRoute();
  useArtKeywordsSync();
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
    logInitPhase('rootLayout.mounted');
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ref guard
    if (ref) {
      reactNavigationIntegration.registerNavigationContainer(ref);
      logInitPhase('navigationContainer.registered');
    }
  }, [ref]);

  const startupConfiguration = useMemo(() => {
    return {
      error: getStartupConfigurationError(),
      snapshot: getApiConfigurationSnapshot(),
    };
  }, []);
  const [runtimeStartupError, setRuntimeStartupError] = useState<Error | null>(null);

  useEffect(() => {
    if (startupConfiguration.error) {
      return;
    }

    setOnLanguageChange((lang) => void saveDefaultLocale(lang));

    applyRuntimeSettings()
      .then(() => {
        logInitPhase('runtimeSettings.applied');
      })
      .catch((error: unknown) => {
        setRuntimeStartupError(
          error instanceof Error ? error : new Error('Failed to apply runtime settings'),
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
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister: queryPersister,
          maxAge: persistMaxAge,
          buster: persistBuster,
          dehydrateOptions: { shouldDehydrateQuery },
        }}
      >
        <I18nProvider>
          <ThemeProvider>
            <AuthProvider>
              <ConnectivityProvider>
                <DataModeProvider>
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
                        <Stack.Screen name="(stack)/change-password" />
                        <Stack.Screen name="(stack)/preferences" />
                        <Stack.Screen name="(stack)/guided-museum-mode" />
                        <Stack.Screen name="(stack)/offline-maps" />
                        <Stack.Screen name="(stack)/discover" />
                        <Stack.Screen name="(stack)/museum-detail" />
                        <Stack.Screen name="(stack)/support" />
                        <Stack.Screen name="(stack)/tickets" />
                        <Stack.Screen name="(stack)/ticket-detail" />
                        <Stack.Screen name="(stack)/create-ticket" />
                        <Stack.Screen name="(stack)/privacy" />
                        <Stack.Screen name="(stack)/terms" />
                        <Stack.Screen name="(stack)/onboarding" />
                        <Stack.Screen name="+not-found" />
                      </Stack>
                      <ThemedStatusBar />
                    </AuthenticationGuard>
                  </BiometricGate>
                </DataModeProvider>
              </ConnectivityProvider>
            </AuthProvider>
          </ThemeProvider>
        </I18nProvider>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayout);
