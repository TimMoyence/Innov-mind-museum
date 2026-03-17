import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/context/AuthContext';
import { useProtectedRoute } from '@/features/auth/useProtectedRoute';
import { applyRuntimeSettings } from '@/features/settings/runtimeSettings';
import {
  getApiConfigurationSnapshot,
  getStartupConfigurationError,
} from '@/services/apiConfig';
import { StartupConfigurationErrorScreen } from '@/shared/ui/StartupConfigurationErrorScreen';

function AuthenticationGuard({ children }: { children: ReactNode }) {
  useProtectedRoute();
  return <>{children}</>;
}

export default function RootLayout() {
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
    <AuthProvider>
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
        <StatusBar style="auto" />
      </AuthenticationGuard>
    </AuthProvider>
  );
}
