import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/context/AuthContext';
import { useProtectedRoute } from '@/features/auth/useProtectedRoute';
import { applyRuntimeSettings } from '@/features/settings/runtimeSettings';

function AuthenticationGuard({ children }: { children: ReactNode }) {
  useProtectedRoute();
  return <>{children}</>;
}

export default function RootLayout() {
  useEffect(() => {
    applyRuntimeSettings().catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Failed to apply runtime settings', error);
    });
  }, []);

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
