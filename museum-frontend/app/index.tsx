import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Href, useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  const AUTH_ROUTE = '/auth' satisfies Href;
  const TABS_ROUTE = '/(tabs)' satisfies Href;

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated) {
      router.replace(TABS_ROUTE);
    } else {
      router.replace(AUTH_ROUTE);
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff',
      }}
    >
      <ActivityIndicator size="large" color="#0066cc" />
    </View>
  );
}
