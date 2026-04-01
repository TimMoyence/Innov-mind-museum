import type { Href } from 'expo-router';

/** Route path for the authentication screen. */
export const AUTH_ROUTE = '/auth' satisfies Href;

/** Route path for the tab navigator root. */
export const TABS_ROUTE = '/(tabs)' satisfies Href;

/** Route path for the home tab within the tab navigator. */
export const HOME_ROUTE = '/(tabs)/home' satisfies Href;

/** Route path for the onboarding screen. */
export const ONBOARDING_ROUTE = '/(stack)/onboarding' satisfies Href;
