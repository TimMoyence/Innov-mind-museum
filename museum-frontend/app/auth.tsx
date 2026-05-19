import { useCallback, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useForm, useWatch } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { useAuth } from '@/features/auth/application/AuthContext';
import { useBiometricAuth } from '@/features/auth/application/useBiometricAuth';
import { useEmailPasswordAuth } from '@/features/auth/application/useEmailPasswordAuth';
import { useFaceIdSessionRestore } from '@/features/auth/application/useFaceIdSessionRestore';
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
import {
  AUTH_FORM_DEFAULTS,
  authSchema,
  type AuthFormValues,
} from '@/features/auth/ui/authFormSchema';
import { authStyles as styles } from '@/features/auth/ui/authStyles';
import { ErrorState } from '@/shared/ui/ErrorState';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

/**
 * Orchestrates the authentication screen: toggles between login and
 * registration modes, owns the form state and business handlers, and
 * delegates rendering to the focused sub-components `LoginForm`,
 * `RegisterForm`, and `SocialLoginButtons`.
 *
 * Form binding (ADR-025): react-hook-form + Zod, Controller pattern in the
 * child forms. The root holds `control` + `handleSubmit` + `getValues`; field
 * subscriptions live inside each Controller, so keystrokes do not re-render
 * this orchestrator (TD-RHF-01). Field-level Zod errors surface inline next
 * to each input via `FormInput.error` (TD-RHF-02).
 */
export default function AuthScreen() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [isLogin, setIsLogin] = useState(true);
  const [showBiometricSheet, setShowBiometricSheet] = useState(false);

  const { control, handleSubmit, getValues, reset } = useForm<AuthFormValues>({
    resolver: zodResolver(authSchema),
    mode: 'onBlur',
    defaultValues: AUTH_FORM_DEFAULTS,
  });

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

  const social = useSocialLogin({
    loginWithSession: loginWithSessionWithBiometricPrompt,
  });

  // F11-mobile (2026-05) — surfaces a "Continue with Face ID" affordance when
  // a refresh token is still in secure-store and biometric is enabled. The
  // happy path goes through AuthContext.bootstrap, but this button covers
  // edge cases where the user lands on auth.tsx with that pair still aligned.
  const faceIdRestore = useFaceIdSessionRestore();
  const handleFaceIdRestore = useCallback(async () => {
    await faceIdRestore.restore();
  }, [faceIdRestore]);

  const getEmail = useCallback(() => getValues('email'), [getValues]);
  const forgot = useForgotPassword({ getEmail });

  const onRegistrationComplete = useCallback(() => {
    setIsLogin(true);
    reset({ ...AUTH_FORM_DEFAULTS, email: getValues('email') });
  }, [getValues, reset]);

  const formValuesGetter = useCallback(
    () => ({
      email: getValues('email'),
      password: getValues('password'),
      firstname: getValues('firstname') ?? '',
      lastname: getValues('lastname') ?? '',
      dateOfBirth: getValues('dateOfBirth') ?? '',
    }),
    [getValues],
  );

  const emailPasswordAuth = useEmailPasswordAuth({
    getValues: formValuesGetter,
    loginWithSession: loginWithSessionWithBiometricPrompt,
    onRegistrationComplete,
  });

  const isLoading = emailPasswordAuth.isPending || forgot.isPending || social.isPending;
  const errorMessage =
    emailPasswordAuth.errorMessage ?? forgot.errorMessage ?? social.errorMessage ?? null;
  const infoMessage =
    emailPasswordAuth.infoMessage ?? forgot.infoMessage ?? social.infoMessage ?? null;

  const { handleAppleSignIn, handleGoogleSignIn, isSocialLoading, appleAuthAvailable } = social;
  const { handleForgotPassword } = forgot;
  const { handleLogin, handleRegister } = emailPasswordAuth;

  // `handleSubmit` runs the Zod resolver first; the mutation only fires on a
  // valid form. Invalid submits leave `formState.errors` populated and the
  // child Controllers surface them inline via `FormInput.error` (TD-RHF-02).
  const onLoginSubmit = useCallback(() => {
    void handleSubmit(() => handleLogin())();
  }, [handleSubmit, handleLogin]);

  const onRegisterSubmit = useCallback(() => {
    void handleSubmit(() => handleRegister())();
  }, [handleSubmit, handleRegister]);

  const handleDismissError = useCallback(() => {
    emailPasswordAuth.clearError();
    forgot.clearError();
    social.clearError();
  }, [emailPasswordAuth, forgot, social]);

  const toggleAuthMode = () => {
    if (isLoading || isSocialLoading) {
      return;
    }
    setIsLogin((value) => !value);
    reset({ ...AUTH_FORM_DEFAULTS, email: getValues('email') });
  };

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
                <ErrorState
                  variant="inline"
                  title={t('common.error')}
                  description={errorMessage}
                  onDismiss={handleDismissError}
                  testID="auth-error-state"
                />
              ) : null}
              {infoMessage ? (
                <Text style={[styles.infoText, { color: theme.success }]}>{infoMessage}</Text>
              ) : null}

              {isLogin && faceIdRestore.canRestore ? (
                <Pressable
                  testID="auth-face-id-button"
                  onPress={() => {
                    void handleFaceIdRestore();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('biometric.continue_with')} ${faceIdRestore.biometricLabel}`}
                  disabled={asyncBusy}
                  style={[
                    styles.faceIdButton,
                    { backgroundColor: theme.primary },
                    asyncBusy && styles.faceIdButtonDisabled,
                  ]}
                >
                  <Ionicons
                    name="finger-print"
                    size={20}
                    color={theme.primaryContrast}
                    style={styles.faceIdButtonIcon}
                  />
                  <Text style={[styles.faceIdButtonLabel, { color: theme.primaryContrast }]}>
                    {`${t('biometric.continue_with')} ${faceIdRestore.biometricLabel}`}
                  </Text>
                </Pressable>
              ) : null}

              {isLogin ? (
                <LoginForm
                  control={control}
                  isLoading={isLoading}
                  isSocialLoading={isSocialLoading}
                  onForgotPassword={handleForgotPassword}
                  onSubmit={onLoginSubmit}
                />
              ) : (
                <RegisterForm
                  control={control}
                  isLoading={isLoading}
                  isSocialLoading={isSocialLoading}
                  onSubmit={onRegisterSubmit}
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

              <SocialLoginButtonsGate
                control={control}
                isLogin={isLogin}
                appleAuthAvailable={appleAuthAvailable}
                disabled={asyncBusy}
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

interface SocialLoginButtonsGateProps {
  control: Control<AuthFormValues>;
  isLogin: boolean;
  appleAuthAvailable: boolean;
  disabled: boolean;
  onApplePress: () => void;
  onGooglePress: () => void;
}

/**
 * Subscribes locally to `gdprAccepted` so toggling GDPR consent in register
 * mode re-renders only this small wrapper, not the whole `AuthScreen`
 * (TD-RHF-01). Social sign-in stays disabled in register mode until consent.
 */
function SocialLoginButtonsGate({
  control,
  isLogin,
  appleAuthAvailable,
  disabled,
  onApplePress,
  onGooglePress,
}: SocialLoginButtonsGateProps) {
  const gdprAccepted = useWatch({ control, name: 'gdprAccepted' });
  const gdprGated = !isLogin && !gdprAccepted;
  return (
    <SocialLoginButtons
      appleAuthAvailable={appleAuthAvailable}
      disabled={disabled}
      gdprGated={gdprGated}
      onApplePress={onApplePress}
      onGooglePress={onGooglePress}
    />
  );
}
