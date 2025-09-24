import { JSX, useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { AuthProvider, useAuth } from '../context/AuthContext';

function AuthenticationGuard({ children }: { children: React.ReactNode }): JSX.Element {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inProtectedRoute = segments[0] === '(tabs)';

    if (!isAuthenticated && inProtectedRoute) {
      router.replace('/auth');
    } else if (isAuthenticated && segments[0] === 'auth') {
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, segments, isLoading, router]);

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
