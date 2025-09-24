import { JSX } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { AuthProvider } from '../context/AuthContext';
import { useProtectedRoute } from '@/features/auth/useProtectedRoute';

function AuthenticationGuard({ children }: { children: React.ReactNode }): JSX.Element {
  useProtectedRoute();

  return <>{children}</>;
}

export default function RootLayout(): JSX.Element {
  return (
    <AuthProvider>
      <AuthenticationGuard>
        <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="auth" />
          <Stack.Screen
            name="(tabs)"
            options={{
              animation: 'flip',
            }}
          />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style="auto" />
      </AuthenticationGuard>
    </AuthProvider>
  );
}
