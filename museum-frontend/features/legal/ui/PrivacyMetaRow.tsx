import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { isPrivacyPlaceholderValue } from '@/features/legal/privacyPolicyContent';
import { useTheme } from '@/shared/ui/ThemeContext';

interface PrivacyMetaRowProps {
  label: string;
  value: string;
  styles: {
    metaRow: StyleProp<ViewStyle>;
    metaLabel: StyleProp<TextStyle>;
    metaValueWrap: StyleProp<ViewStyle>;
    metaValue: StyleProp<TextStyle>;
    metaValuePlaceholder: StyleProp<TextStyle>;
    pendingBadge: StyleProp<TextStyle>;
  };
}

export const PrivacyMetaRow = ({ label, value, styles }: PrivacyMetaRowProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const isPlaceholder = isPrivacyPlaceholderValue(value);

  return (
    <View style={styles.metaRow}>
      <Text style={[styles.metaLabel, { color: theme.textPrimary }]}>{label}</Text>
      <View style={styles.metaValueWrap}>
        <Text
          style={[
            styles.metaValue,
            { color: theme.textSecondary },
            isPlaceholder && [styles.metaValuePlaceholder, { color: theme.warningText }],
          ]}
        >
          {value}
        </Text>
        {isPlaceholder ? (
          <Text
            style={[
              styles.pendingBadge,
              {
                color: theme.warningText,
                backgroundColor: theme.warningBackground,
                borderColor: theme.warningBackground,
              },
            ]}
          >
            {t('privacy.pending_badge')}
          </Text>
        ) : null}
      </View>
    </View>
  );
};
