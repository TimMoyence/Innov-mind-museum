import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';

import { useAuth } from '@/features/auth/application/AuthContext';
import { useUserProfileStore } from '@/features/settings/infrastructure/userProfileStore';
import { AUTH_ROUTE, HOME_ROUTE, ONBOARDING_ROUTE } from './routes';

/**
 * Guards navigation based on authentication state.
 * Redirects unauthenticated users to the auth screen and authenticated users away from it.
 * Forces first-launch users through onboarding before reaching home.
 */
export const useProtectedRoute = (): void => {
  const { isAuthenticated, isLoading, isFirstLaunch } = useAuth();
  const hasSeenOnboarding = useUserProfileStore((s) => s.hasSeenOnboarding);
  const segments = useSegments();
  const router = useRouter();

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
      if (isFirstLaunch && !hasSeenOnboarding) {
        router.replace(ONBOARDING_ROUTE);
      } else {
        router.replace(HOME_ROUTE);
      }
      return;
    }

    // If authenticated, first launch, local flag not yet set, and not already on onboarding screen, redirect there
    if (
      isAuthenticated &&
      isFirstLaunch &&
      !hasSeenOnboarding &&
      !isOnboardingRoute &&
      !isAuthRoute
    ) {
      router.replace(ONBOARDING_ROUTE);
    }
  }, [isAuthenticated, isLoading, isFirstLaunch, hasSeenOnboarding, router, segments]);
};
