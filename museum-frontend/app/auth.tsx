import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';

import { useAuth } from '@/context/AuthContext';
import { authStorage } from '@/features/auth/infrastructure/authStorage';
import { HOME_ROUTE } from '@/features/auth/routes';
import { getErrorMessage } from '@/shared/lib/errors';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { BrandMark } from '@/shared/ui/BrandMark';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { liquidColors, pickMuseumBackground } from '@/shared/ui/liquidTheme';
import {
  authService,
  setAccessToken,
  signInWithApple,
  signInWithGoogle,
  isAppleSignInAvailable,
} from '@/services';
import type { LoginResponse } from '@/services/authService';

/** Renders the login and registration screen with email/password, Apple, and Google sign-in options. */
export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstname, setFirstname] = useState('');
  const [lastname, setLastname] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [appleAuthAvailable, setAppleAuthAvailable] = useState(false);
  const { setIsAuthenticated } = useAuth();

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAuthAvailable);
  }, []);

  const handleSocialLoginSuccess = async (response: LoginResponse): Promise<void> => {
    if (response?.accessToken && response?.refreshToken) {
      await authStorage.setRefreshToken(response.refreshToken);
      setAccessToken(response.accessToken);
      setIsAuthenticated(true);
      setTimeout(() => {
        router.replace(HOME_ROUTE);
      }, 120);
    }
  };

  const handleAppleSignIn = async (): Promise<void> => {
    setIsLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const { provider, idToken } = await signInWithApple();
      const response = await authService.socialLogin(provider, idToken);
      await handleSocialLoginSuccess(response);
    } catch (error) {
      const message = getErrorMessage(error);
      if (!message.includes('canceled') && !message.includes('cancelled')) {
        setErrorMessage(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async (): Promise<void> => {
    setIsLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const { provider, idToken } = await signInWithGoogle();
      const response = await authService.socialLogin(provider, idToken);
      await handleSocialLoginSuccess(response);
    } catch (error) {
      const message = getErrorMessage(error);
      if (!message.includes('canceled') && !message.includes('cancelled')) {
        setErrorMessage(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (): Promise<void> => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const response = await authService.login(email, password);

      if (response?.accessToken && response?.refreshToken) {
        await authStorage.setRefreshToken(response.refreshToken);
        setAccessToken(response.accessToken);
        setIsAuthenticated(true);

        setTimeout(() => {
          router.replace(HOME_ROUTE);
        }, 120);
      } else {
        Alert.alert('Error', 'Login failed - invalid auth response');
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (): Promise<void> => {
    if (!email || !password || !firstname || !lastname) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      await authService.register({
        email,
        password,
        firstname,
        lastname,
      });
      setIsLogin(true);
      setInfoMessage('Registration complete. Please log in.');
      setFirstname('');
      setLastname('');
      setPassword('');
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = (): void => {
    if (!email) {
      Alert.alert('Error', 'Please enter your email address');
      return;
    }

    Alert.alert(
      'Password reset',
      'Would you like to receive a password reset email?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setIsLoading(true);
            setErrorMessage(null);
            setInfoMessage(null);
            try {
              await authService.forgotPassword(email);
              Alert.alert(
                'Email sent',
                'If this email is associated with an account, you will receive a reset link.',
              );
            } catch (error) {
              setErrorMessage(getErrorMessage(error));
            } finally {
              setIsLoading(false);
            }
          },
        },
      ],
    );
  };

  const toggleAuthMode = () => {
    if (isLoading) {
      return;
    }
    setIsLogin((value) => !value);
    setErrorMessage(null);
    setInfoMessage(null);
  };

  const openGuide = () => {
    router.push('/(stack)/onboarding');
  };

  return (
    <LiquidScreen background={pickMuseumBackground(1)} contentStyle={styles.screen}>
      <View style={styles.menuWrap}>
        <FloatingContextMenu
          actions={[
            { id: 'style', icon: 'color-filter-outline', label: 'Style', onPress: toggleAuthMode },
            { id: 'guide', icon: 'sparkles-outline', label: 'Guide', onPress: openGuide },
            { id: 'safe', icon: 'shield-checkmark-outline', label: 'Safe', onPress: handleForgotPassword },
          ]}
        />
      </View>

      <GlassCard style={styles.panel} intensity={66}>
        <View style={styles.header}>
          <BrandMark variant='auth' />
          <Text style={styles.title}>{isLogin ? 'Welcome back' : 'Create your account'}</Text>
          <Text style={styles.subtitle}>
            {isLogin
              ? 'Sign in to continue your cultural journey.'
              : 'Create a Musaium account to save and resume your visits.'}
          </Text>
        </View>

        <View style={styles.form}>
          {errorMessage ? (
            <ErrorNotice message={errorMessage} onDismiss={() => setErrorMessage(null)} />
          ) : null}
          {infoMessage ? <Text style={styles.infoText}>{infoMessage}</Text> : null}

          {!isLogin ? (
            <>
              <View style={styles.inputShell}>
                <Ionicons name='person-outline' size={20} color={liquidColors.textSecondary} />
                <TextInput
                  style={styles.input}
                  placeholder='First name'
                  placeholderTextColor='#64748B'
                  value={firstname}
                  onChangeText={setFirstname}
                />
              </View>
              <View style={styles.inputShell}>
                <Ionicons name='person-outline' size={20} color={liquidColors.textSecondary} />
                <TextInput
                  style={styles.input}
                  placeholder='Last name'
                  placeholderTextColor='#64748B'
                  value={lastname}
                  onChangeText={setLastname}
                />
              </View>
            </>
          ) : null}

          <View style={styles.inputShell}>
            <Ionicons name='mail-outline' size={20} color={liquidColors.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder='Email'
              placeholderTextColor='#64748B'
              value={email}
              onChangeText={setEmail}
              autoCapitalize='none'
              keyboardType='email-address'
            />
          </View>

          <View style={styles.inputShell}>
            <Ionicons name='lock-closed-outline' size={20} color={liquidColors.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder='Password'
              placeholderTextColor='#64748B'
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          {isLogin ? (
            <Pressable style={styles.forgotPasswordButton} onPress={handleForgotPassword}>
              <Text style={styles.forgotPasswordText}>Forgot password?</Text>
            </Pressable>
          ) : null}

          <Pressable
            style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
            onPress={isLogin ? handleLogin : handleRegister}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color='#FFFFFF' />
            ) : (
              <Text style={styles.submitButtonText}>{isLogin ? 'Log in' : 'Sign up'}</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.switchButton}
            onPress={toggleAuthMode}
            disabled={isLoading}
          >
            <Text style={styles.switchButtonText}>
              {isLogin ? 'No account? Sign up' : 'Already have an account? Log in'}
            </Text>
          </Pressable>

          <View style={styles.separator}>
            <View style={styles.separatorLine} />
            <Text style={styles.separatorText}>or continue with</Text>
            <View style={styles.separatorLine} />
          </View>

          {appleAuthAvailable ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={14}
              style={styles.appleButton}
              onPress={() => void handleAppleSignIn()}
            />
          ) : null}

          <Pressable
            style={styles.googleButton}
            onPress={() => void handleGoogleSignIn()}
            disabled={isLoading}
          >
            <Ionicons name='logo-google' size={20} color={liquidColors.textPrimary} />
            <Text style={styles.googleButtonText}>Sign in with Google</Text>
          </Pressable>

          <Text style={styles.legalText}>
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </Text>
        </View>
      </GlassCard>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 18,
    justifyContent: 'center',
    gap: 12,
  },
  menuWrap: {
    alignItems: 'center',
    marginBottom: 8,
  },
  panel: {
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 14,
  },
  header: {
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: liquidColors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: liquidColors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  form: {
    gap: 10,
  },
  infoText: {
    color: '#166534',
    fontWeight: '600',
    fontSize: 13,
    marginBottom: 6,
  },
  inputShell: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.42)',
    backgroundColor: 'rgba(255,255,255,0.74)',
    minHeight: 50,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    color: liquidColors.textPrimary,
    fontSize: 15,
    paddingVertical: 8,
  },
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  forgotPasswordText: {
    fontSize: 13,
    color: liquidColors.primary,
    fontWeight: '600',
  },
  submitButton: {
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: liquidColors.primary,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
  },
  submitButtonDisabled: {
    opacity: 0.72,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  switchButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.42)',
    backgroundColor: 'rgba(255,255,255,0.66)',
    paddingVertical: 12,
    alignItems: 'center',
  },
  switchButtonText: {
    color: liquidColors.textPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
  separator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 4,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(148,163,184,0.36)',
  },
  separatorText: {
    color: liquidColors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  appleButton: {
    height: 50,
    width: '100%',
  },
  googleButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.42)',
    backgroundColor: 'rgba(255,255,255,0.82)',
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  googleButtonText: {
    color: liquidColors.textPrimary,
    fontWeight: '700',
    fontSize: 15,
  },
  legalText: {
    color: liquidColors.textSecondary,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 4,
  },
});
