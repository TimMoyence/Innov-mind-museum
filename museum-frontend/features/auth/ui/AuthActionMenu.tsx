import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ONBOARDING_ROUTE } from '@/features/auth/routes';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';

import { authStyles as styles } from './authStyles';

interface AuthActionMenuProps {
  onToggleMode: () => void;
  onForgotPassword: () => void;
}

export function AuthActionMenu({ onToggleMode, onForgotPassword }: AuthActionMenuProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.menuWrap}>
      <FloatingContextMenu
        actions={[
          {
            id: 'style',
            icon: 'color-filter-outline',
            label: t('auth.badge_style'),
            onPress: onToggleMode,
          },
          {
            id: 'guide',
            icon: 'sparkles-outline',
            label: t('auth.badge_guide'),
            onPress: () => {
              router.push(ONBOARDING_ROUTE);
            },
          },
          {
            id: 'safe',
            icon: 'shield-checkmark-outline',
            label: t('auth.badge_safe'),
            onPress: onForgotPassword,
          },
        ]}
      />
    </View>
  );
}
