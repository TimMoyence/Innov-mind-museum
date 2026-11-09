import { useTranslation } from 'react-i18next';

import { LiquidButton } from '@/shared/ui/LiquidButton';

interface AuthModeSwitchButtonProps {
  isLogin: boolean;
  disabled: boolean;
  onPress: () => void;
}

export function AuthModeSwitchButton({ isLogin, disabled, onPress }: AuthModeSwitchButtonProps) {
  const { t } = useTranslation();

  return (
    <LiquidButton
      label={isLogin ? t('auth.no_account') : t('auth.has_account')}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={isLogin ? t('a11y.auth.toggle_register') : t('a11y.auth.toggle_login')}
      variant="secondary"
      size="md"
    />
  );
}
