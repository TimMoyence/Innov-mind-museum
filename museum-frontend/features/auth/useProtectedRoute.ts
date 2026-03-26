import { useEffect, useState } from 'react';
import { useRouter, useSegments } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useAuth } from '@/context/AuthContext';
import { AUTH_ROUTE, HOME_ROUTE } from './routes';

const ONBOARDING_COMPLETE_KEY = 'onboarding.complete';

/**
 * Guards navigation based on authentication state.
 * Redirects unauthenticated users to the auth screen and authenticated users away from it.
 * Forces first-launch users through onboarding before reaching home.
 */
export const useProtectedRoute = (): void => {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY)
      .then((value) => { setIsFirstLaunch(value !== 'true'); })
      .catch(() => { setIsFirstLaunch(true); });
  }, []);

  useEffect(() => {
    if (isLoading || isFirstLaunch === null) {
      return;
    }

    const currentRoot = segments[0];
    const isAuthRoute = currentRoot === 'auth';
    const segmentParts = segments as string[];
    const isOnboardingRoute = currentRoot === '(stack)' && segmentParts[1] === 'onboarding';

    if (!isAuthenticated && !isAuthRoute) {
      router.replace(AUTH_ROUTE);
      return;
    }

    if (isAuthenticated && isAuthRoute) {
      if (isFirstLaunch) {
        router.replace('/(stack)/onboarding');
      } else {
        router.replace(HOME_ROUTE);
      }
      return;
    }

    // If authenticated, first launch, and not already on onboarding screen, redirect there
    if (isAuthenticated && isFirstLaunch && !isOnboardingRoute && !isAuthRoute) {
      router.replace('/(stack)/onboarding');
    }
  }, [isAuthenticated, isLoading, isFirstLaunch, router, segments]);
};
