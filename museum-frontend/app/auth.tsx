import { useState } from 'react';
import { View, Text, StyleSheet, ImageBackground, TextInput, TouchableOpacity } from 'react-native';
import { BlurView } from 'expo-blur';
import { Link, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = () => {
    router.replace('/');
  };

  return (
    <ImageBackground
      source={{ uri: 'https://images.unsplash.com/photo-1541961017774-22349e4a1262' }}
      style={styles.container}>
      <BlurView intensity={60} tint="light" style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>ArtTalk</Text>
          <Text style={styles.subtitle}>
            {isLogin ? 'Connectez-vous pour continuer' : 'Créez votre compte'}
          </Text>
        </View>

        <View style={styles.form}>
          <BlurView intensity={40} tint="light" style={styles.inputContainer}>
            <Ionicons name="mail-outline" size={24} color="#1a1a1a" />
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#666"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </BlurView>

          <BlurView intensity={40} tint="light" style={styles.inputContainer}>
            <Ionicons name="lock-closed-outline" size={24} color="#1a1a1a" />
            <TextInput
              style={styles.input}
              placeholder="Mot de passe"
              placeholderTextColor="#666"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </BlurView>

          <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
            <BlurView intensity={40} tint="light" style={styles.submitButtonContent}>
              <Text style={styles.submitButtonText}>
                {isLogin ? 'Se connecter' : "S'inscrire"}
              </Text>
            </BlurView>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.switchButton}
            onPress={() => setIsLogin(!isLogin)}>
            <Text style={styles.switchButtonText}>
              {isLogin
                ? "Pas de compte ? S'inscrire"
                : 'Déjà un compte ? Se connecter'}
            </Text>
          </TouchableOpacity>
        </View>
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
    margin: 20,
    borderRadius: 15,
    overflow: 'hidden',
    padding: 20,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
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
    textAlign: 'center',
  },
  form: {
    gap: 15,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    overflow: 'hidden',
    padding: 15,
  },
  input: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
    color: '#1a1a1a',
  },
  submitButton: {
    marginTop: 20,
    borderRadius: 10,
    overflow: 'hidden',
  },
  submitButtonContent: {
    padding: 15,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  switchButton: {
    marginTop: 15,
    alignItems: 'center',
  },
  switchButtonText: {
    fontSize: 14,
    color: '#1a1a1a',
    textDecorationLine: 'underline',
  },
}); 