import { View, Text, StyleSheet, ImageBackground } from 'react-native';
import { BlurView } from 'expo-blur';
import { Link } from 'expo-router';

export default function HomeScreen() {
  return (
    <ImageBackground
      source={{ uri: 'https://images.unsplash.com/photo-1582555172866-f73bb12a2ab3' }}
      style={styles.container}>
      <BlurView intensity={60} tint="light" style={styles.content}>
        <Text style={styles.title}>Welcome to ArtTalk</Text>
        <Text style={styles.subtitle}>Discuss and explore art masterpieces</Text>
        <Link href="/conversations" style={styles.link}>
          <Text style={styles.linkText}>Start a Discussion</Text>
        </Link>
      </BlurView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#4a4a4a',
    marginBottom: 30,
    textAlign: 'center',
  },
  link: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  linkText: {
    color: '#1a1a1a',
    fontSize: 16,
    fontWeight: '600',
  },
});