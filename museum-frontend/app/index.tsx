import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { useAuth } from '@/context/AuthContext';
import { AUTH_ROUTE, HOME_ROUTE } from '@/features/auth/routes';

/** Renders a redirect to the home or auth screen based on the current authentication state. */
export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <View />;
  }

  return <Redirect href={isAuthenticated ? HOME_ROUTE : AUTH_ROUTE} />;
}
