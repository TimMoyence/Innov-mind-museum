import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { useAuth } from '@/features/auth/application/AuthContext';
import { useBiometricAuth } from '@/features/auth/application/useBiometricAuth';
import { useEmailPasswordAuth } from '@/features/auth/application/useEmailPasswordAuth';
import { useForgotPassword } from '@/features/auth/application/useForgotPassword';
import { useSocialLogin } from '@/features/auth/application/useSocialLogin';
import { AuthActionMenu } from '@/features/auth/ui/AuthActionMenu';
import { AuthHeader } from '@/features/auth/ui/AuthHeader';
import { AuthModeSwitchButton } from '@/features/auth/ui/AuthModeSwitchButton';
import { AuthSeparator } from '@/features/auth/ui/AuthSeparator';
import { BiometricSetupSheet } from '@/features/auth/ui/BiometricSetupSheet';
import { LoginForm } from '@/features/auth/ui/LoginForm';
import { RegisterForm } from '@/features/auth/ui/RegisterForm';
import { SocialLoginButtons } from '@/features/auth/ui/SocialLoginButtons';
import { authStyles as styles } from '@/features/auth/ui/authStyles';
import { ErrorNotice } from '@/shared/ui/ErrorNotice';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

// ── Form schema (ADR-025: react-hook-form + Zod for ≥3 validated fields) ──────
// Register-only fields (firstname, lastname, gdprAccepted) are optional in the
// schema; the existing useEmailPasswordAuth handler enforces them at submit time
// so we don't duplicate that validation here.
const authSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  firstname: z.string().optional(),
  lastname: z.string().optional(),
  gdprAccepted: z.boolean().optional(),
});
type AuthFormValues = z.infer<typeof authSchema>;

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
  // TODO(spec-followup): migrate setIsLoading/setErrorMessage/setInfoMessage to useMutation;
  // requires rewriting useEmailPasswordAuth + useForgotPassword + useSocialLogin DI callbacks.
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [showBiometricSheet, setShowBiometricSheet] = useState(false);

  // ── Form fields (ADR-025: react-hook-form + Zod) ────────────────────────────
  const { watch, setValue } = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema),
    mode: 'onBlur',
    defaultValues: { email: '', password: '', firstname: '', lastname: '', gdprAccepted: false },
  });

  const email = watch('email');
  const password = watch('password');
  const firstname = watch('firstname') ?? '';
  const lastname = watch('lastname') ?? '';
  const gdprAccepted = watch('gdprAccepted') ?? false;
  const { loginWithSession } = useAuth();
  type Session = Parameters<typeof loginWithSession>[0];
  const pendingSessionRef = useRef<Session | null>(null);
  const biometric = useBiometricAuth();

  // Wraps the auth-context loginWithSession so that, on first successful login
  // when biometrics are available but not enrolled yet, we open the setup
  // sheet BEFORE flipping isAuthenticated. Otherwise the navigation guard
  // would unmount the auth screen and the sheet would never display.
  const loginWithSessionWithBiometricPrompt = useCallback(
    async (session: Session): Promise<void> => {
      if (biometric.isAvailable && !biometric.isEnabled) {
        pendingSessionRef.current = session;
        setShowBiometricSheet(true);
        return;
      }
      await loginWithSession(session);
    },
    [biometric.isAvailable, biometric.isEnabled, loginWithSession],
  );

  const finalizePendingSession = useCallback(async (): Promise<void> => {
    const session = pendingSessionRef.current;
    pendingSessionRef.current = null;
    setShowBiometricSheet(false);
    if (session) {
      await loginWithSession(session);
    }
  }, [loginWithSession]);

  const handleBiometricActivate = useCallback(async (): Promise<void> => {
    try {
      await biometric.enable();
    } finally {
      await finalizePendingSession();
    }
  }, [biometric, finalizePendingSession]);

  const handleBiometricSkip = useCallback(() => {
    void finalizePendingSession();
  }, [finalizePendingSession]);

  const { handleAppleSignIn, handleGoogleSignIn, isSocialLoading, appleAuthAvailable } =
    useSocialLogin({
      loginWithSession: loginWithSessionWithBiometricPrompt,
      setErrorMessage,
      setInfoMessage,
    });

  const { handleForgotPassword } = useForgotPassword({
    email,
    setIsLoading,
    setErrorMessage,
    setInfoMessage,
  });

  const onRegistrationComplete = useCallback(() => {
    setIsLogin(true);
    setValue('firstname', '');
    setValue('lastname', '');
    setValue('password', '');
  }, [setValue]);

  const { handleLogin, handleRegister } = useEmailPasswordAuth({
    email,
    password,
    firstname,
    lastname,
    loginWithSession: loginWithSessionWithBiometricPrompt,
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
    setValue('gdprAccepted', false);
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
                  onChangeEmail={(value) => {
                    setValue('email', value, { shouldValidate: true });
                  }}
                  onChangePassword={(value) => {
                    setValue('password', value, { shouldValidate: true });
                  }}
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
                  onChangeEmail={(value) => {
                    setValue('email', value, { shouldValidate: true });
                  }}
                  onChangePassword={(value) => {
                    setValue('password', value, { shouldValidate: true });
                  }}
                  onChangeFirstname={(value) => {
                    setValue('firstname', value, { shouldValidate: true });
                  }}
                  onChangeLastname={(value) => {
                    setValue('lastname', value, { shouldValidate: true });
                  }}
                  onToggleGdpr={() => {
                    setValue('gdprAccepted', !gdprAccepted);
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

      <BiometricSetupSheet
        visible={showBiometricSheet}
        biometricLabel={biometric.biometricLabel}
        onActivate={handleBiometricActivate}
        onSkip={handleBiometricSkip}
      />
    </LiquidScreen>
  );
}
