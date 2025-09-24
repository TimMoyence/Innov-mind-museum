import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (isAuthenticated) {
      router.replace('/(tabs)');
    } else {
      router.replace('/auth');
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
