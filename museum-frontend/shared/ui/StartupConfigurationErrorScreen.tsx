import type { StyleProp, ViewStyle } from 'react-native';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ApiConfigurationSnapshot } from '@/shared/infrastructure/apiConfig';

interface StartupConfigurationErrorScreenProps {
  error: Error;
  snapshot: ApiConfigurationSnapshot;
  containerStyle?: StyleProp<ViewStyle>;
}

/** Displays a diagnostic error screen shown when the app cannot start due to missing or invalid build configuration. */
export function StartupConfigurationErrorScreen({
  error,
  snapshot,
  containerStyle,
}: StartupConfigurationErrorScreenProps) {
  const { t } = useTranslation(undefined, { useSuspense: false });
  const fallback = t('common.not_configured');

  return (
    <SafeAreaView style={[styles.safeArea, containerStyle]}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{t('startupError.badge')}</Text>
        </View>

        <Text style={styles.title}>{t('startupError.title')}</Text>
        <Text style={styles.message}>{error.message}</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('startupError.build_context')}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>{t('startupError.build_variant')}</Text>
            <Text style={styles.value}>{snapshot.buildVariant}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t('startupError.api_env')}</Text>
            <Text style={styles.value}>{snapshot.apiEnvironment}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t('startupError.resolved_url')}</Text>
            <Text style={styles.value}>{snapshot.resolvedBaseUrl}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t('startupError.staging_url')}</Text>
            <Text style={styles.value}>
              {snapshot.stagingBaseUrl ?? fallback}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t('startupError.prod_url')}</Text>
            <Text style={styles.value}>
              {snapshot.productionBaseUrl ?? fallback}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('startupError.how_to_fix')}</Text>
          <Text style={styles.step}>
            {t('startupError.step1')}
          </Text>
          <Text style={styles.step}>
            {t('startupError.step2')}
          </Text>
          <Text style={styles.step}>
            {t('startupError.step3')}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#130f0d',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 28,
    gap: 18,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#70584a',
    backgroundColor: '#231915',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    color: '#f5d7c2',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: {
    color: '#fff7f1',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
  },
  message: {
    color: '#e4cfc2',
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#3b2d25',
    backgroundColor: '#1b1411',
    padding: 18,
    gap: 12,
  },
  cardTitle: {
    color: '#fff7f1',
    fontSize: 16,
    fontWeight: '700',
  },
  row: {
    gap: 4,
  },
  label: {
    color: '#c7a58e',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  value: {
    color: '#f6ebe4',
    fontSize: 15,
    lineHeight: 22,
  },
  step: {
    color: '#f6ebe4',
    fontSize: 15,
    lineHeight: 22,
  },
});
