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
    void applyRuntimeSettings();
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
          <Stack.Screen name="(stack)/onboarding" />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="auto" />
      </AuthenticationGuard>
    </AuthProvider>
  );
}
