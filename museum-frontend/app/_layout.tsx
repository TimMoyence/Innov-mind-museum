import { JSX, useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { AuthProvider, useAuth } from "../context/AuthContext";

declare global {
  interface Window {
    frameworkReady?: () => void;
  }
}

function AuthenticationGuard({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inProtectedRoute = segments[0] === "(tabs)";

    if (!isAuthenticated && inProtectedRoute) {
      router.navigate("/auth");
    } else if (isAuthenticated && segments[0] === "auth") {
      router.navigate("/(tabs)");
    }
  }, [isAuthenticated, segments, isLoading, router]);

  return <>{children}</>;
}

function RootLayoutNav() {
  useEffect(() => {
    if (typeof window !== "undefined" && window.frameworkReady) {
      window.frameworkReady();
    }
  }, []);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth" />
        <Stack.Screen 
          name="(tabs)" 
          options={{
            // Force une nouvelle navigation complète au lieu d'une transition
            animation: 'flip',
          }} 
        />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
    </AuthProvider>
  );
}

