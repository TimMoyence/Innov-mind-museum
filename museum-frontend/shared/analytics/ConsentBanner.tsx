import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAnalyticsConsent } from '@/shared/analytics/useAnalyticsConsent';

const COLOR_BACKDROP = 'rgba(15, 23, 42, 0.96)';
const COLOR_SHADOW = '#000000';
const COLOR_TITLE = '#F8FAFC';
const COLOR_DESCRIPTION = '#CBD5E1';
const COLOR_DECLINE_BG = 'rgba(148, 163, 184, 0.22)';
const COLOR_DECLINE_LABEL = '#E2E8F0';
const COLOR_ACCEPT_BG = '#1D4ED8';
const COLOR_ACCEPT_LABEL = '#FFFFFF';

export function ConsentBanner(): React.ReactElement | null {
  const { t } = useTranslation();
  const { status, grant, decline } = useAnalyticsConsent();

  if (status !== 'unset') return null;

  return (
    <View
      style={styles.container}
      accessibilityRole="alert"
      accessibilityLabel={t('paywall.analyticsConsent.title')}
      testID="analytics-consent-banner"
    >
      <Text style={styles.title}>{t('paywall.analyticsConsent.title')}</Text>
      <Text style={styles.description}>{t('paywall.analyticsConsent.description')}</Text>
      <View style={styles.actions}>
        <Pressable
          onPress={decline}
          accessibilityRole="button"
          accessibilityLabel={t('paywall.analyticsConsent.optOut')}
          style={({ pressed }) => [
            styles.button,
            styles.declineButton,
            pressed ? styles.buttonPressed : null,
          ]}
          testID="analytics-consent-decline"
        >
          <Text style={styles.declineLabel}>{t('paywall.analyticsConsent.optOut')}</Text>
        </Pressable>
        <Pressable
          onPress={grant}
          accessibilityRole="button"
          accessibilityLabel={t('paywall.analyticsConsent.optIn')}
          style={({ pressed }) => [
            styles.button,
            styles.acceptButton,
            pressed ? styles.buttonPressed : null,
          ]}
          testID="analytics-consent-accept"
        >
          <Text style={styles.acceptLabel}>{t('paywall.analyticsConsent.optIn')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    start: 16,
    end: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: COLOR_BACKDROP,
    shadowColor: COLOR_SHADOW,
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: COLOR_TITLE,
    marginBottom: 6,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    color: COLOR_DESCRIPTION,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginStart: 8,
    minWidth: 88,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  declineButton: {
    backgroundColor: COLOR_DECLINE_BG,
  },
  declineLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLOR_DECLINE_LABEL,
  },
  acceptButton: {
    backgroundColor: COLOR_ACCEPT_BG,
  },
  acceptLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLOR_ACCEPT_LABEL,
  },
});
