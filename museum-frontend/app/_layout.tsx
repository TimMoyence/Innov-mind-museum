import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Stack, useNavigationContainerRef } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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
import { installGlobalErrorHandler } from '@/shared/observability/global-error-handler';
import { logInitPhase } from '@/shared/observability/init-phase-breadcrumbs';

import '@/features/museum/infrastructure/mapLibreBootstrap';

import { AuthProvider } from '@/features/auth/application/AuthContext';
import { BiometricGate } from '@/features/auth/ui/BiometricGate';
import { useProtectedRoute } from '@/features/auth/useProtectedRoute';
import { useArtKeywordsSync } from '@/features/art-keywords/application/useArtKeywordsSync';
import i18n from '@/shared/i18n/i18n';
import { I18nProvider } from '@/shared/i18n/I18nContext';
import { PaywallProvider, usePaywall } from '@/features/paywall/application/PaywallProvider';
import { QuotaUpsellModal } from '@/features/paywall/ui/QuotaUpsellModal';
import { ConsentBanner } from '@/shared/analytics/ConsentBanner';
import { setErrorTranslate } from '@/shared/lib/errors';

setErrorTranslate((key, opts) => i18n.t(key as 'error.network', opts));
import { DataModeProvider } from '@/features/chat/application/DataModeProvider';
import { OfflineQueueProvider } from '@/features/chat/application/useOfflineQueue';
import { ThemeProvider, useTheme } from '@/shared/ui/ThemeContext';
import { ConnectivityProvider } from '@/shared/infrastructure/connectivity/ConnectivityProvider';
import { GlobalOfflineBannerHost } from '@/shared/infrastructure/connectivity/GlobalOfflineBannerHost';
import { resolveInitialApiBaseUrl } from '@/shared/infrastructure/apiConfig';
import { ErrorBoundary } from '@/shared/ui/ErrorBoundary';
import { initCertPinning } from '@/shared/infrastructure/cert-pinning-init';
import { readEnvString } from '@/shared/lib/env';

const sentryDsn: string | undefined =
  Platform.OS === 'android'
    ? readEnvString(process.env.EXPO_PUBLIC_SENTRY_DSN_ANDROID)
    : readEnvString(process.env.EXPO_PUBLIC_SENTRY_DSN_IOS);

initSentry(sentryDsn);
logInitPhase('sentry.initialized', { platform: Platform.OS, hasDsn: Boolean(sentryDsn) });

installGlobalErrorHandler();

void initCertPinning({ apiBaseUrl: resolveInitialApiBaseUrl() })
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

function PaywallModalHost() {
  const { isOpen, reason, close } = usePaywall();
  return <QuotaUpsellModal visible={isOpen} reason={reason} onClose={close} />;
}

function RootLayout() {
  const ref = useNavigationContainerRef();

  useEffect(() => {
    logInitPhase('rootLayout.mounted');
    reactNavigationIntegration.registerNavigationContainer(ref);
    logInitPhase('navigationContainer.registered');
  }, [ref]);

  return (
    <GestureHandlerRootView style={layoutStyles.gestureRoot}>
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
            <PaywallProvider>
              <ThemeProvider>
                <AuthProvider>
                  <ConnectivityProvider>
                    <OfflineQueueProvider>
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
                              <Stack.Screen name="(stack)/verify-email" />
                              <Stack.Screen name="(stack)/confirm-email-change" />
                              <Stack.Screen name="(stack)/reset-password" />
                              <Stack.Screen name="(stack)/preferences" />
                              <Stack.Screen name="(stack)/guided-museum-mode" />
                              <Stack.Screen name="(stack)/offline-maps" />
                              <Stack.Screen name="(stack)/discover" />
                              <Stack.Screen name="(stack)/museum-detail" />
                              <Stack.Screen
                                name="(stack)/museums-picker"
                                options={{ presentation: 'modal' }}
                              />
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
                            <GlobalOfflineBannerHost />
                            <PaywallModalHost />
                            <ConsentBanner />
                          </AuthenticationGuard>
                        </BiometricGate>
                      </DataModeProvider>
                    </OfflineQueueProvider>
                  </ConnectivityProvider>
                </AuthProvider>
              </ThemeProvider>
            </PaywallProvider>
          </I18nProvider>
        </PersistQueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

const layoutStyles = StyleSheet.create({
  gestureRoot: { flex: 1 },
});

export default Sentry.wrap(RootLayout);
