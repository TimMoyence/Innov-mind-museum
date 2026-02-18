import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

export default function OnboardingScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to MuseumIA</Text>
      <Text style={styles.body}>
        1. Start a conversation from Home.{"\n"}
        2. Ask a text question or attach an artwork image.{"\n"}
        3. Use settings to point the app to your backend URL.
      </Text>

      <Pressable style={styles.button} onPress={() => router.replace('/(tabs)/home')}>
        <Text style={styles.buttonText}>Back to Home</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#FFFBEB',
    justifyContent: 'center',
    gap: 16,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#78350F',
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: '#92400E',
  },
  button: {
    marginTop: 20,
    backgroundColor: '#92400E',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
