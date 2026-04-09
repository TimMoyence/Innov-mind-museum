import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';

import { authStyles as styles } from './authStyles';

/**
 * "— or continue with —" horizontal rule with centered label, used to
 * separate the email/password form from the social login buttons.
 */
export function AuthSeparator() {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <View style={styles.separator}>
      <View style={[styles.separatorLine, { backgroundColor: theme.separator }]} />
      <Text style={[styles.separatorText, { color: theme.textSecondary }]}>
        {t('common.or_continue_with')}
      </Text>
      <View style={[styles.separatorLine, { backgroundColor: theme.separator }]} />
    </View>
  );
}
