import type { StyleProp, ViewStyle } from 'react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import type { ApiConfigurationSnapshot } from '@/shared/infrastructure/apiConfig';
import { semantic } from './tokens.semantic';

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
            <Text style={styles.value}>{snapshot.stagingBaseUrl ?? fallback}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t('startupError.prod_url')}</Text>
            <Text style={styles.value}>{snapshot.productionBaseUrl ?? fallback}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('startupError.how_to_fix')}</Text>
          <Text style={styles.step}>{t('startupError.step1')}</Text>
          <Text style={styles.step}>{t('startupError.step2')}</Text>
          <Text style={styles.step}>{t('startupError.step3')}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: semantic.errorScreen.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: semantic.screen.paddingLarge,
    paddingVertical: semantic.screen.paddingXL,
    gap: semantic.card.paddingLarge,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: semantic.badge.radiusFull,
    borderWidth: 1,
    borderColor: semantic.errorScreen.badgeBorder,
    backgroundColor: semantic.errorScreen.badgeBackground,
    paddingHorizontal: semantic.card.paddingCompact,
    paddingVertical: semantic.list.itemGapSmall,
  },
  badgeText: {
    color: semantic.errorScreen.textAccent,
    fontSize: semantic.card.captionSize,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: {
    color: semantic.errorScreen.textPrimary,
    fontSize: semantic.section.titleSizeHero,
    fontWeight: '700',
    lineHeight: 34,
  },
  message: {
    color: semantic.errorScreen.textSecondary,
    fontSize: semantic.section.subtitleSize,
    lineHeight: semantic.section.titleSizeLarge,
  },
  card: {
    borderRadius: semantic.card.radius,
    borderWidth: 1,
    borderColor: semantic.errorScreen.cardBorder,
    backgroundColor: semantic.errorScreen.cardBackground,
    padding: semantic.card.paddingLarge,
    gap: semantic.card.gap,
  },
  cardTitle: {
    color: semantic.errorScreen.textPrimary,
    fontSize: semantic.section.subtitleSize,
    fontWeight: '700',
  },
  row: {
    gap: semantic.card.gapTiny,
  },
  label: {
    color: semantic.errorScreen.textLabel,
    fontSize: semantic.card.captionSize,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  value: {
    color: semantic.errorScreen.textValue,
    fontSize: semantic.chat.fontSizeSmall,
    lineHeight: semantic.chat.iconSize,
  },
  step: {
    color: semantic.errorScreen.textValue,
    fontSize: semantic.chat.fontSizeSmall,
    lineHeight: semantic.chat.iconSize,
  },
});
