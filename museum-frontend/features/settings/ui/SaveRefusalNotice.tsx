import { StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { getErrorMessage } from '@/shared/lib/errors';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic } from '@/shared/ui/tokens';

export const SaveRefusalNotice = ({ refusal }: { refusal: Error | null }) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  if (!refusal) return null;

  return (
    <Text style={[styles.notice, { color: theme.error }]} accessibilityLiveRegion="polite">
      {t('preferences.save_failed', { error: getErrorMessage(refusal) })}
    </Text>
  );
};

const styles = StyleSheet.create({
  notice: {
    fontSize: semantic.form.labelSize,
    fontWeight: '600',
  },
});
