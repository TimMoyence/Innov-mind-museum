import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { useAuth } from '@/features/auth/application/AuthContext';
import { AUTH_ROUTE, HOME_ROUTE } from '@/features/auth/routes';

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <View />;
  }

  return <Redirect href={isAuthenticated ? HOME_ROUTE : AUTH_ROUTE} />;
}
