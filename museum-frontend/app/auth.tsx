import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/features/auth/application/AuthContext';
import { useEmailPasswordAuth } from '@/features/auth/application/useEmailPasswordAuth';
import { useForgotPassword } from '@/features/auth/application/useForgotPassword';
import { useSocialLogin } from '@/features/auth/application/useSocialLogin';
import { AuthActionMenu } from '@/features/auth/ui/AuthActionMenu';
import { AuthHeader } from '@/features/auth/ui/AuthHeader';
import { AuthModeSwitchButton } from '@/features/auth/ui/AuthModeSwitchButton';
import { AuthSeparator } from '@/features/auth/ui/AuthSeparator';
import { LoginForm } from '@/features/auth/ui/LoginForm';
import { RegisterForm } from '@/features/auth/ui/RegisterForm';
import { SocialLoginButtons } from '@/features/auth/ui/SocialLoginButtons';
import { authStyles as styles } from '@/features/auth/ui/authStyles';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

/**
 * Orchestrates the authentication screen: toggles between login and
 * registration modes, owns the form state and business handlers, and
 * delegates rendering to the focused sub-components `LoginForm`,
 * `RegisterForm`, and `SocialLoginButtons`.
 */
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
  const { loginWithSession } = useAuth();

  const { handleAppleSignIn, handleGoogleSignIn, isSocialLoading, appleAuthAvailable } =
    useSocialLogin({ loginWithSession, setErrorMessage, setInfoMessage });

  const { handleForgotPassword } = useForgotPassword({
    email,
    setIsLoading,
    setErrorMessage,
    setInfoMessage,
  });

  const onRegistrationComplete = useCallback(() => {
    setIsLogin(true);
    setFirstname('');
    setLastname('');
    setPassword('');
  }, []);

  const { handleLogin, handleRegister } = useEmailPasswordAuth({
    email,
    password,
    firstname,
    lastname,
    loginWithSession,
    setIsLoading,
    setErrorMessage,
    setInfoMessage,
    onRegistrationComplete,
  });

  const toggleAuthMode = () => {
    if (isLoading || isSocialLoading) {
      return;
    }
    setIsLogin((value) => !value);
    setErrorMessage(null);
    setInfoMessage(null);
    setGdprAccepted(false);
  };

  const gdprGated = !isLogin && !gdprAccepted;
  const asyncBusy = isLoading || isSocialLoading;

  return (
    <LiquidScreen
      background={pickMuseumBackground(1)}
      contentStyle={[styles.screen, { paddingTop: insets.top + 12 }]}
    >
      <AuthActionMenu onToggleMode={toggleAuthMode} onForgotPassword={handleForgotPassword} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <GlassCard style={styles.panel} intensity={66}>
            <AuthHeader isLogin={isLogin} />

            <View style={styles.form}>
              {errorMessage ? (
                <ErrorNotice
                  message={errorMessage}
                  onDismiss={() => {
                    setErrorMessage(null);
                  }}
                />
              ) : null}
              {infoMessage ? (
                <Text style={[styles.infoText, { color: theme.success }]}>{infoMessage}</Text>
              ) : null}

              {isLogin ? (
                <LoginForm
                  email={email}
                  password={password}
                  isLoading={isLoading}
                  isSocialLoading={isSocialLoading}
                  onChangeEmail={setEmail}
                  onChangePassword={setPassword}
                  onForgotPassword={handleForgotPassword}
                  onSubmit={() => {
                    void handleLogin();
                  }}
                />
              ) : (
                <RegisterForm
                  email={email}
                  password={password}
                  firstname={firstname}
                  lastname={lastname}
                  gdprAccepted={gdprAccepted}
                  isLoading={isLoading}
                  isSocialLoading={isSocialLoading}
                  onChangeEmail={setEmail}
                  onChangePassword={setPassword}
                  onChangeFirstname={setFirstname}
                  onChangeLastname={setLastname}
                  onToggleGdpr={() => {
                    setGdprAccepted((v) => !v);
                  }}
                  onSubmit={() => {
                    void handleRegister();
                  }}
                  onOpenTerms={() => {
                    router.push('/(stack)/terms');
                  }}
                  onOpenPrivacy={() => {
                    router.push('/(stack)/privacy');
                  }}
                />
              )}

              <AuthModeSwitchButton
                isLogin={isLogin}
                disabled={asyncBusy}
                onPress={toggleAuthMode}
              />

              <AuthSeparator />

              <SocialLoginButtons
                appleAuthAvailable={appleAuthAvailable}
                disabled={asyncBusy}
                gdprGated={gdprGated}
                onApplePress={() => void handleAppleSignIn()}
                onGooglePress={() => void handleGoogleSignIn()}
              />

              {isLogin ? (
                <Text style={[styles.legalText, { color: theme.textSecondary }]}>
                  {t('auth.legal_notice')}
                </Text>
              ) : null}
            </View>
          </GlassCard>
        </ScrollView>
      </KeyboardAvoidingView>
    </LiquidScreen>
  );
}
