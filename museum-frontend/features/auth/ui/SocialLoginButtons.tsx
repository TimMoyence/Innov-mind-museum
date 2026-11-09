import { View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useTranslation } from 'react-i18next';

import { LiquidButton } from '@/shared/ui/LiquidButton';

import { authStyles as styles } from './authStyles';

interface SocialLoginButtonsProps {
  appleAuthAvailable: boolean;
  disabled: boolean;
  gdprGated: boolean;
  onApplePress: () => void;
  onGooglePress: () => void;
}

export function SocialLoginButtons({
  appleAuthAvailable,
  disabled,
  gdprGated,
  onApplePress,
  onGooglePress,
}: SocialLoginButtonsProps) {
  const { t } = useTranslation();

  return (
    <>
      {appleAuthAvailable ? (
        <View
          style={gdprGated ? styles.gated : styles.open}
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

      <LiquidButton
        label={t('auth.sign_in_google')}
        onPress={onGooglePress}
        disabled={disabled || gdprGated}
        iconName="logo-google"
        iconPosition="leading"
        accessibilityLabel={t('a11y.auth.google_signin')}
        variant="secondary"
        size="md"
      />
    </>
  );
}
