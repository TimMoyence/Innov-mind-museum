import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/context/AuthContext';
import { authStorage } from '@/features/auth/infrastructure/authStorage';
import { HOME_ROUTE } from '@/features/auth/routes';
import { useSocialLogin } from '@/features/auth/application/useSocialLogin';
import { getErrorMessage } from '@/shared/lib/errors';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { BrandMark } from '@/shared/ui/BrandMark';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';
import { authService, setAccessToken } from '@/services';

/** Renders the login and registration screen with email/password, Apple, and Google sign-in options. */
export default function AuthScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstname, setFirstname] = useState('');
  const [lastname, setLastname] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [gdprAccepted, setGdprAccepted] = useState(false);
  const { setIsAuthenticated } = useAuth();

  const {
    handleAppleSignIn,
    handleGoogleSignIn,
    isSocialLoading,
    appleAuthAvailable,
  } = useSocialLogin({ setIsAuthenticated, setErrorMessage, setInfoMessage });

  const handleLogin = async (): Promise<void> => {
    if (!email || !password) {
      Alert.alert(t('common.error'), t('auth.fill_all_fields'));
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
        Alert.alert(t('common.error'), t('auth.login_failed'));
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (): Promise<void> => {
    if (!email || !password || !firstname || !lastname) {
      Alert.alert(t('common.error'), t('auth.fill_all_fields'));
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
      setInfoMessage(t('auth.registration_complete'));
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
      Alert.alert(t('common.error'), t('auth.fill_all_fields'));
      return;
    }

    Alert.alert(
      t('auth.password_reset_title'),
      t('auth.password_reset_confirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.send'),
          onPress: async () => {
            setIsLoading(true);
            setErrorMessage(null);
            setInfoMessage(null);
            try {
              await authService.forgotPassword(email);
              Alert.alert(
                t('auth.email_sent_title'),
                t('auth.email_sent_message'),
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
    if (isLoading || isSocialLoading) {
      return;
    }
    setIsLogin((value) => !value);
    setErrorMessage(null);
    setInfoMessage(null);
    setGdprAccepted(false);
  };

  const openGuide = () => {
    router.push('/(stack)/onboarding');
  };

  const openTerms = () => {
    router.push('/(stack)/terms');
  };

  const openPrivacy = () => {
    router.push('/(stack)/privacy');
  };

  return (
    <LiquidScreen background={pickMuseumBackground(1)} contentStyle={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.menuWrap}>
        <FloatingContextMenu
          actions={[
            { id: 'style', icon: 'color-filter-outline', label: t('auth.badge_style'), onPress: toggleAuthMode },
            { id: 'guide', icon: 'sparkles-outline', label: t('auth.badge_guide'), onPress: openGuide },
            { id: 'safe', icon: 'shield-checkmark-outline', label: t('auth.badge_safe'), onPress: handleForgotPassword },
          ]}
        />
      </View>

      <GlassCard style={styles.panel} intensity={66}>
        <View style={styles.header}>
          <BrandMark variant='auth' />
          <Text style={[styles.title, { color: theme.textPrimary }]}>{isLogin ? t('auth.welcome_back') : t('auth.create_account')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {isLogin
              ? t('auth.sign_in_subtitle')
              : t('auth.sign_up_subtitle')}
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
                <Ionicons name='person-outline' size={20} color={theme.textSecondary} />
                <TextInput
                  style={[styles.input, { color: theme.textPrimary }]}
                  placeholder={t('auth.first_name')}
                  placeholderTextColor='#64748B'
                  value={firstname}
                  onChangeText={setFirstname}
                />
              </View>
              <View style={styles.inputShell}>
                <Ionicons name='person-outline' size={20} color={theme.textSecondary} />
                <TextInput
                  style={[styles.input, { color: theme.textPrimary }]}
                  placeholder={t('auth.last_name')}
                  placeholderTextColor='#64748B'
                  value={lastname}
                  onChangeText={setLastname}
                />
              </View>
            </>
          ) : null}

          <View style={styles.inputShell}>
            <Ionicons name='mail-outline' size={20} color={theme.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder={t('auth.email')}
              placeholderTextColor='#64748B'
              value={email}
              onChangeText={setEmail}
              autoCapitalize='none'
              keyboardType='email-address'
            />
          </View>

          <View style={styles.inputShell}>
            <Ionicons name='lock-closed-outline' size={20} color={theme.textSecondary} />
            <TextInput
              style={styles.input}
              placeholder={t('auth.password')}
              placeholderTextColor='#64748B'
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          {isLogin ? (
            <Pressable style={styles.forgotPasswordButton} onPress={handleForgotPassword}>
              <Text style={[styles.forgotPasswordText, { color: theme.primary }]}>{t('auth.forgot_password')}</Text>
            </Pressable>
          ) : null}

          {!isLogin ? (
            <Pressable style={styles.gdprRow} onPress={() => setGdprAccepted((v) => !v)}>
              <View style={[styles.checkbox, gdprAccepted && { backgroundColor: theme.primary, borderColor: theme.primary }]}>
                {gdprAccepted ? <Ionicons name='checkmark' size={14} color='#FFFFFF' /> : null}
              </View>
              <Text style={[styles.gdprText, { color: theme.textSecondary }]}>
                {t('auth.agree_terms').split(t('auth.terms_of_service'))[0]}
                <Text style={[styles.gdprLink, { color: theme.primary }]} onPress={openTerms}>{t('auth.terms_of_service')}</Text>
                {t('auth.agree_terms').split(t('auth.terms_of_service'))[1]?.split(t('auth.privacy_policy'))[0]}
                <Text style={[styles.gdprLink, { color: theme.primary }]} onPress={openPrivacy}>{t('auth.privacy_policy')}</Text>
              </Text>
            </Pressable>
          ) : null}

          <Pressable
            style={[styles.submitButton, { backgroundColor: theme.primary }, (isLoading || isSocialLoading || (!isLogin && !gdprAccepted)) && styles.submitButtonDisabled]}
            onPress={isLogin ? handleLogin : handleRegister}
            disabled={isLoading || isSocialLoading || (!isLogin && !gdprAccepted)}
          >
            {isLoading || isSocialLoading ? (
              <ActivityIndicator color='#FFFFFF' />
            ) : (
              <Text style={styles.submitButtonText}>{isLogin ? t('auth.log_in') : t('auth.sign_up')}</Text>
            )}
          </Pressable>

          <Pressable
            style={styles.switchButton}
            onPress={toggleAuthMode}
            disabled={isLoading || isSocialLoading}
          >
            <Text style={[styles.switchButtonText, { color: theme.textPrimary }]}>
              {isLogin ? t('auth.no_account') : t('auth.has_account')}
            </Text>
          </Pressable>

          <View style={styles.separator}>
            <View style={styles.separatorLine} />
            <Text style={[styles.separatorText, { color: theme.textSecondary }]}>{t('common.or_continue_with')}</Text>
            <View style={styles.separatorLine} />
          </View>

          {appleAuthAvailable ? (
            <View style={{ opacity: !isLogin && !gdprAccepted ? 0.5 : 1 }} pointerEvents={!isLogin && !gdprAccepted ? 'none' : 'auto'}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={14}
                style={styles.appleButton}
                onPress={() => void handleAppleSignIn()}
              />
            </View>
          ) : null}

          <Pressable
            style={[styles.googleButton, (!isLogin && !gdprAccepted) && { opacity: 0.5 }]}
            onPress={() => void handleGoogleSignIn()}
            disabled={isLoading || isSocialLoading || (!isLogin && !gdprAccepted)}
          >
            <Ionicons name='logo-google' size={20} color={theme.textPrimary} />
            <Text style={[styles.googleButtonText, { color: theme.textPrimary }]}>{t('auth.sign_in_google')}</Text>
          </Pressable>

          {isLogin ? (
            <Text style={[styles.legalText, { color: theme.textSecondary }]}>
              {t('auth.legal_notice')}
            </Text>
          ) : null}
        </View>
      </GlassCard>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 16,
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
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
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
    fontSize: 15,
    paddingVertical: 8,
  },
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  forgotPasswordText: {
    fontSize: 13,
    fontWeight: '600',
  },
  submitButton: {
    marginTop: 8,
    borderRadius: 14,
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
    fontWeight: '700',
    fontSize: 15,
  },
  gdprRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(148,163,184,0.6)',
    backgroundColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  gdprText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  gdprLink: {
    fontWeight: '600',
  },
  legalText: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 4,
  },
});
