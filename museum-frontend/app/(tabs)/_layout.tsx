import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';

export default function TabLayout() {
  const { logout } = useAuth();

  const renderHeaderRight = () => {
    return (
      <TouchableOpacity 
        onPress={logout} 
        style={styles.logoutButton}
      >
        <Ionicons name="log-out-outline" size={24} color="#0066cc" />
      </TouchableOpacity>
    );
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerTransparent: true,
        headerBackground: () => (
          <BlurView intensity={70} tint="light" style={StyleSheet.absoluteFill} />
        ),
        headerTitleStyle: styles.headerTitle,
        headerRight: renderHeaderRight,
        tabBarStyle: styles.tabBar,
        tabBarBackground: () => (
          <BlurView intensity={70} tint="light" style={StyleSheet.absoluteFill} />
        ),
        tabBarActiveTintColor: '#0066cc',
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="conversations"
        options={{
          title: 'Discussions',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderTopWidth: 0,
    elevation: 0,
    height: 60,
  },
  headerTitle: {
    color: '#1a1a1a',
    fontWeight: '600',
  },
  logoutButton: {
    marginRight: 16,
    padding: 8,
  },
});