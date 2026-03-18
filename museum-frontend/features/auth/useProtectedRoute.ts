import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';

import { useAuth } from '@/context/AuthContext';
import { AUTH_ROUTE, HOME_ROUTE } from './routes';

/**
 * Guards navigation based on authentication state.
 * Redirects unauthenticated users to the auth screen and authenticated users away from it.
 */
export const useProtectedRoute = (): void => {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const currentRoot = segments[0];
    const isAuthRoute = currentRoot === 'auth';

    if (!isAuthenticated && !isAuthRoute) {
      router.replace(AUTH_ROUTE);
      return;
    }

    if (isAuthenticated && isAuthRoute) {
      router.replace(HOME_ROUTE);
    }
  }, [isAuthenticated, isLoading, router, segments]);
};
