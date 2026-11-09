import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Trans, useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';

import { authStyles as styles } from './authStyles';

interface GdprConsentCheckboxProps {
  accepted: boolean;
  onToggle: () => void;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
}

export function GdprConsentCheckbox({
  accepted,
  onToggle,
  onOpenTerms,
  onOpenPrivacy,
}: GdprConsentCheckboxProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <Pressable
      style={styles.gdprRow}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityLabel={t('a11y.auth.gdpr_checkbox')}
      accessibilityState={{ checked: accepted }}
    >
      <View
        testID="gdpr-consent-checkbox"
        style={[
          styles.checkbox,
          { borderColor: theme.inputBorder, backgroundColor: theme.inputBackground },
          accepted && {
            backgroundColor: theme.primary,
            borderColor: theme.primary,
          },
        ]}
      >
        {accepted ? <Ionicons name="checkmark" size={14} color={theme.primaryContrast} /> : null}
      </View>
      <Text style={[styles.gdprText, { color: theme.textSecondary }]}>
        <Trans
          i18nKey="auth.agree_terms_rich"
          components={{
            terms: (
              <Text
                style={[styles.gdprLink, { color: theme.primary }]}
                onPress={onOpenTerms}
                accessibilityRole="link"
                accessibilityLabel={t('a11y.auth.terms_link')}
              />
            ),
            privacy: (
              <Text
                style={[styles.gdprLink, { color: theme.primary }]}
                onPress={onOpenPrivacy}
                accessibilityRole="link"
                accessibilityLabel={t('a11y.auth.privacy_link')}
              />
            ),
          }}
        />
      </Text>
    </Pressable>
  );
}
