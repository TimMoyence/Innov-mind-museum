import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';

import { authStyles as styles } from './authStyles';

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
