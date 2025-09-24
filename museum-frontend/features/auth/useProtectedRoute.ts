import { useEffect } from 'react';
import { Href, useRouter, useSegments } from 'expo-router';

import { useAuth } from '@/context/AuthContext';

const AUTH_ROUTE = '/auth' satisfies Href;
const TABS_ROUTE = '/(tabs)' satisfies Href;

export const useProtectedRoute = (): void => {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const currentRoot = segments[0];

    if (!isAuthenticated && currentRoot === '(tabs)') {
      router.replace(AUTH_ROUTE);
      return;
    }

    if (isAuthenticated && currentRoot === 'auth') {
      router.replace(TABS_ROUTE);
    }
  }, [isAuthenticated, isLoading, router, segments]);
};
