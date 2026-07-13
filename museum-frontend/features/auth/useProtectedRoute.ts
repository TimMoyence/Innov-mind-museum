import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';

import { useAuth } from '@/features/auth/application/AuthContext';
import { useUserProfileStore } from '@/features/settings/infrastructure/userProfileStore';
import { AUTH_ROUTE, HOME_ROUTE, ONBOARDING_ROUTE } from './routes';

/**
 * `(stack)` leaf routes reachable WITHOUT authentication. The magic-link
 * targets (`reset-password`, `verify-email`, `confirm-email-change`) are opened
 * from an email link precisely when the user is signed out — a forgotten-
 * password or email-verification link. Bouncing them to `/auth` made the deep
 * links dead (the reset-password form never rendered → every forgot-password
 * user hit a wall). They stay client-safe: the one-time token is validated
 * server-side on submit, so exposing the screen leaks nothing.
 */
const PUBLIC_STACK_ROUTES = new Set(['reset-password', 'verify-email', 'confirm-email-change']);

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
    const isPublicRoute =
      currentRoot === '(stack)' && PUBLIC_STACK_ROUTES.has(segmentParts[1] ?? '');

    if (!isAuthenticated && !isAuthRoute && !isPublicRoute) {
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

    // If authenticated, first launch, local flag not yet set, and not already on
    // onboarding screen, redirect there.
    //
    // `!isPublicRoute` matters as much here as it does in the unauthenticated
    // branch above: registration AUTO-LOGS-IN (useEmailPasswordAuth →
    // loginWithSession), so a brand-new registrant is authenticated with
    // isFirstLaunch=true / hasSeenOnboarding=false at the exact moment they leave
    // for their inbox and tap the verification link. Without this check the guard
    // bounces them to onboarding and the verify-email screen never mounts — the
    // single most common magic link would stay broken for the only population that
    // ever receives it.
    if (
      isAuthenticated &&
      isFirstLaunch &&
      !hasSeenOnboarding &&
      !isOnboardingRoute &&
      !isAuthRoute &&
      !isPublicRoute
    ) {
      router.replace(ONBOARDING_ROUTE);
    }
  }, [isAuthenticated, isLoading, isFirstLaunch, hasSeenOnboarding, router, segments]);
};
