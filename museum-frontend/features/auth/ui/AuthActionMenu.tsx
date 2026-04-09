import { View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ONBOARDING_ROUTE } from '@/features/auth/routes';
import { FloatingContextMenu } from '@/shared/ui/FloatingContextMenu';

import { authStyles as styles } from './authStyles';

interface AuthActionMenuProps {
  /** Toggle between login and register modes. */
  onToggleMode: () => void;
  /** Trigger the forgot-password flow. */
  onForgotPassword: () => void;
}

/**
 * Floating action menu shown above the auth card: provides quick
 * access to mode toggle, the onboarding guide, and the forgot-password
 * flow. Purely presentational wiring around `FloatingContextMenu`.
 */
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
