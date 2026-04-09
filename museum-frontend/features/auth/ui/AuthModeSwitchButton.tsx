import { Pressable, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';

import { authStyles as styles } from './authStyles';

interface AuthModeSwitchButtonProps {
  /** Whether the screen is currently in login mode (otherwise register). */
  isLogin: boolean;
  /** Disable presses while any async auth action is in flight. */
  disabled: boolean;
  /** Called when the user wants to flip between login and register. */
  onPress: () => void;
}

/**
 * Button that flips the auth screen between login and register modes.
 * Label and accessibility announce the *target* mode ("no account? sign up"
 * / "already have an account? log in") rather than the current one.
 */
export function AuthModeSwitchButton({ isLogin, disabled, onPress }: AuthModeSwitchButtonProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <Pressable
      style={[
        styles.switchButton,
        { borderColor: theme.cardBorder, backgroundColor: theme.cardBackground },
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={isLogin ? t('a11y.auth.toggle_register') : t('a11y.auth.toggle_login')}
    >
      <Text style={[styles.switchButtonText, { color: theme.textPrimary }]}>
        {isLogin ? t('auth.no_account') : t('auth.has_account')}
      </Text>
    </Pressable>
  );
}
