import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { GlassCard } from '@/shared/ui/GlassCard';
import { useTheme } from '@/shared/ui/ThemeContext';

type SettingsRoute =
  | '/(stack)/preferences'
  | '/(stack)/privacy'
  | '/(stack)/terms'
  | '/(stack)/support'
  | '/(stack)/guided-museum-mode'
  | '/(stack)/onboarding'
  | '/(tabs)/home';

interface SettingsComplianceLinksProps {
  onNavigate: (path: SettingsRoute) => void;
  onExportData: () => void;
  isExporting: boolean;
}

/** Compliance links card: privacy, terms, support, onboarding, export. */
export const SettingsComplianceLinks = ({
  onNavigate,
  onExportData,
  isExporting,
}: SettingsComplianceLinksProps) => {
  const { t } = useTranslation();
  const { theme } = useTheme();

  return (
    <GlassCard style={styles.card} intensity={52}>
      <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
        {t('settings.compliance_title')}
      </Text>
      <View style={styles.linkList}>
        <Pressable
          style={[
            styles.linkRow,
            { borderColor: theme.cardBorder, backgroundColor: theme.surface },
          ]}
          onPress={() => {
            onNavigate('/(stack)/privacy');
          }}
          accessibilityRole="link"
          accessibilityLabel={t('a11y.settings.privacy_link')}
        >
          <Text style={[styles.linkTitle, { color: theme.textPrimary }]}>
            {t('settings.privacy_rgpd')}
          </Text>
          <Text style={[styles.linkDescription, { color: theme.textSecondary }]}>
            {t('settings.privacy_desc')}
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.linkRow,
            { borderColor: theme.cardBorder, backgroundColor: theme.surface },
          ]}
          onPress={() => {
            onNavigate('/(stack)/terms');
          }}
          accessibilityRole="link"
          accessibilityLabel={t('a11y.settings.terms_link')}
        >
          <Text style={[styles.linkTitle, { color: theme.textPrimary }]}>
            {t('settings.terms_of_service')}
          </Text>
          <Text style={[styles.linkDescription, { color: theme.textSecondary }]}>
            {t('settings.terms_desc')}
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.linkRow,
            { borderColor: theme.cardBorder, backgroundColor: theme.surface },
          ]}
          onPress={() => {
            onNavigate('/(stack)/support');
          }}
          accessibilityRole="link"
          accessibilityLabel={t('a11y.settings.support_link')}
        >
          <Text style={[styles.linkTitle, { color: theme.textPrimary }]}>
            {t('settings.support')}
          </Text>
          <Text style={[styles.linkDescription, { color: theme.textSecondary }]}>
            {t('settings.support_desc')}
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.linkRow,
            { borderColor: theme.cardBorder, backgroundColor: theme.surface },
          ]}
          onPress={() => {
            onNavigate('/(stack)/onboarding');
          }}
          accessibilityRole="link"
          accessibilityLabel={t('a11y.settings.onboarding_link')}
        >
          <Text style={[styles.linkTitle, { color: theme.textPrimary }]}>
            {t('settings.onboarding_help')}
          </Text>
          <Text style={[styles.linkDescription, { color: theme.textSecondary }]}>
            {t('settings.onboarding_desc')}
          </Text>
        </Pressable>
      </View>
      <Pressable
        style={[styles.linkRow, { borderColor: theme.cardBorder, backgroundColor: theme.surface }]}
        onPress={onExportData}
        disabled={isExporting}
        accessibilityRole="button"
        accessibilityLabel={t('a11y.settings.export_data')}
      >
        {isExporting ? (
          <ActivityIndicator color={theme.primary} />
        ) : (
          <>
            <Text style={[styles.linkTitle, { color: theme.textPrimary }]}>
              {t('settings.export_data')}
            </Text>
            <Text style={[styles.linkDescription, { color: theme.textSecondary }]}>
              {t('settings.export_data_desc')}
            </Text>
          </>
        )}
      </Pressable>
    </GlassCard>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 10,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: 17,
  },
  linkList: {
    gap: 8,
  },
  linkRow: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  linkTitle: {
    fontWeight: '700',
    fontSize: 14,
  },
  linkDescription: {
    lineHeight: 18,
    fontSize: 12,
  },
});
