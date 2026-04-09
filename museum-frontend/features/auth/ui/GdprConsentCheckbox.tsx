import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Trans, useTranslation } from 'react-i18next';

import { useTheme } from '@/shared/ui/ThemeContext';

import { authStyles as styles } from './authStyles';

interface GdprConsentCheckboxProps {
  /** Whether the user has accepted GDPR terms. */
  accepted: boolean;
  /** Toggle the accepted state. */
  onToggle: () => void;
  /** Open the terms-of-service screen. */
  onOpenTerms: () => void;
  /** Open the privacy policy screen. */
  onOpenPrivacy: () => void;
}

/**
 * GDPR consent checkbox with inline rich-text links to the terms of
 * service and privacy policy. Used inside the registration form to
 * gate account creation and social sign-in until consent is granted.
 */
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
