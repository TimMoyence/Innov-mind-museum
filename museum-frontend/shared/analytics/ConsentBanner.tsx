import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAnalyticsConsent } from '@/shared/analytics/useAnalyticsConsent';

// Brand colours kept as module-level constants — keeps the StyleSheet free of
// inline literals (lint `react-native/no-color-literals`). The values intentionally
// don't go through the theme because the consent banner is shown PRE-onboarding
// and must remain readable in both light and dark contexts (the dark
// translucent backdrop works for both).
const COLOR_BACKDROP = 'rgba(15, 23, 42, 0.96)';
const COLOR_SHADOW = '#000000';
const COLOR_TITLE = '#F8FAFC';
const COLOR_DESCRIPTION = '#CBD5E1';
const COLOR_DECLINE_BG = 'rgba(148, 163, 184, 0.22)';
const COLOR_DECLINE_LABEL = '#E2E8F0';
const COLOR_ACCEPT_BG = '#1D4ED8';
const COLOR_ACCEPT_LABEL = '#FFFFFF';

/**
 * TD-C5-MOBILE-CONSENT-01 — Analytics consent banner UI.
 *
 * Closes the gap reported by the Wave C5 reviewer : `useAnalyticsConsent`
 * (hook) + i18n strings shipped Wave C5, but no UI consumed them so the
 * funnel signal was 0 in prod. This component renders an opt-in / opt-out
 * banner above the navigation tree until the user makes a choice ; once a
 * decision is persisted (`status !== 'unset'`), the banner returns `null`
 * forever (the persisted `'denied'` status keeps it suppressed on remount).
 *
 * Lib-docs reference :
 *  - `lib-docs/plausible/PATTERNS.md` §3.4 — consent gate UX : explicit
 *    opt-in/opt-out CTAs, persisted decision, banner dismissed after either
 *    choice. The two CTAs MUST be visually equivalent (no dark pattern that
 *    makes "Decline" smaller / greyed).
 *  - `lib-docs/plausible/PATTERNS.md` §4 — Musaium policy : transparent
 *    opt-out exposed even though Plausible cookieless is technically exempt
 *    from ePrivacy Art. 5(3).
 *
 * Mounted at the root layout (`museum-frontend/app/_layout.tsx`) so it
 * floats above every screen during the unset window. Visibility predicate
 * `status === 'unset'` — returns `null` for `'granted'` and `'denied'`.
 *
 * No emoji unicode (CLAUDE.md gotcha — RN screens). RTL discipline :
 * `marginStart/End` rather than `Left/Right` ; `paddingStart/End`. a11y
 * roles + labels on every Pressable.
 */
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
    // RTL-safe positioning (CLAUDE.md gotcha) — `start`/`end` instead of `left`/`right`.
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
