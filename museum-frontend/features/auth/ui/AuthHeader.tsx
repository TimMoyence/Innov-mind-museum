import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BrandMark } from '@/shared/ui/BrandMark';
import { useTheme } from '@/shared/ui/ThemeContext';

import { authStyles as styles } from './authStyles';

interface AuthHeaderProps {
  isLogin: boolean;
}

export function AuthHeader({ isLogin }: AuthHeaderProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <View style={styles.header}>
      <BrandMark variant="auth-compact" />
      <View style={styles.headerText}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>
          {isLogin ? t('auth.welcome_back') : t('auth.create_account')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]} numberOfLines={2}>
          {isLogin ? t('auth.sign_in_subtitle') : t('auth.sign_up_subtitle')}
        </Text>
      </View>
    </View>
  );
}
