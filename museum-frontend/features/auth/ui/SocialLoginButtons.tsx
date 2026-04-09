import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';

import { authStyles as styles } from './authStyles';

interface SocialLoginButtonsProps {
  /** Whether Apple Sign-In is available on the current device. */
  appleAuthAvailable: boolean;
  /** Whether the buttons should be visually and functionally disabled. */
  disabled: boolean;
  /** True when the buttons are GDPR-gated (register mode without consent). */
  gdprGated: boolean;
  onApplePress: () => void;
  onGooglePress: () => void;
}

/**
 * Social login block: optional Apple Sign-In button and Google Sign-In
 * button. Buttons respect a disabled state and an additional GDPR gate
 * used during registration: when `gdprGated` is true, the buttons are
 * visually dimmed and cannot be activated until consent is granted.
 */
export function SocialLoginButtons({
  appleAuthAvailable,
  disabled,
  gdprGated,
  onApplePress,
  onGooglePress,
}: SocialLoginButtonsProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <>
      {appleAuthAvailable ? (
        <View
          // eslint-disable-next-line react-native/no-inline-styles -- dynamic opacity for GDPR gate: computed from login + consent state
          style={{ opacity: gdprGated ? 0.5 : 1 }}
          pointerEvents={gdprGated ? 'none' : 'auto'}
          accessibilityRole="button"
          accessibilityLabel={t('a11y.auth.apple_signin')}
        >
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={14}
            style={styles.appleButton}
            onPress={onApplePress}
          />
        </View>
      ) : null}

      <Pressable
        style={[
          styles.googleButton,
          { borderColor: theme.cardBorder, backgroundColor: theme.assistantBubble },
          // eslint-disable-next-line react-native/no-inline-styles -- dynamic opacity for GDPR gate: computed from login + consent state
          gdprGated && { opacity: 0.5 },
        ]}
        onPress={onGooglePress}
        disabled={disabled || gdprGated}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.auth.google_signin')}
      >
        <Ionicons name="logo-google" size={20} color={theme.textPrimary} />
        <Text style={[styles.googleButtonText, { color: theme.textPrimary }]}>
          {t('auth.sign_in_google')}
        </Text>
      </Pressable>
    </>
  );
}
