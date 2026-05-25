import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { useTranslation } from 'react-i18next';

import { trackFunnelEvent } from '@/shared/analytics/plausible';
import { leadsApi } from '@/features/paywall/infrastructure/leadsApi';

/**
 * Safe breadcrumb shim — handles the case where the test-utils Sentry mock
 * (which omits `addBreadcrumb`) overrides a per-file mock. Production Sentry
 * exposes the method ; the shim no-ops only in tests that don't re-mock.
 */
const safeAddBreadcrumb = (breadcrumb: {
  category: string;
  type?: string;
  message: string;
  data?: unknown;
}): void => {
  const sentry = Sentry as unknown as { addBreadcrumb?: (b: unknown) => void };
  if (typeof sentry.addBreadcrumb === 'function') {
    sentry.addBreadcrumb(breadcrumb);
  }
};

/**
 * R1 (C6) — Soft-paywall upsell modal. Strictly RN `<Modal>` native ; the
 * chat-ux bottom-sheet router is OFF-LIMITS per N2 / AC13 (its name is
 * never referenced here so the module-boundary sentinel stays green).
 * Dismissible via the close button + `onRequestClose` (hardware-back on
 * Android + swipe-down on iOS) per Q7 no-dark-pattern doctrine.
 *
 * Submission path :
 *  - email field + explicit consent checkbox (N6 — RGPD Art. 7) + hidden
 *    honeypot (`website`) forwarded to the BE for silent-drop policing.
 *  - submit fires `httpClient.post('/api/leads/paywall-interest', payload)`.
 *  - 202 → `paywall.success` shown + breadcrumb `paywall_email_captured`.
 *  - non-2xx → `paywall.error` inline, modal stays open (R28).
 *
 * No hardcoded UX strings — every visible literal comes from `t('paywall.*')`
 * (R29 / N8). Forbidden list enforced by the sentinel grep test.
 */

interface QuotaReason {
  tier: string;
  currentCount: number;
  limit: number;
  resetAt: string;
}

interface QuotaUpsellModalProps {
  visible: boolean;
  reason: QuotaReason | null;
  onClose: () => void;
}

type SubmitState = 'idle' | 'sending' | 'success' | 'error';

export function QuotaUpsellModal({ visible, reason, onClose }: QuotaUpsellModalProps) {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  // Honeypot — invisible to humans, hidden via `display: 'none'`. Bots that
  // auto-fill every field forward a non-empty value → BE silent-drops (R23).
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<SubmitState>('idle');

  // F2 corrective (2026-05-16, ultrareview bug_005) — Reset modal-local state on
  // every visible→false transition. The modal subtree stays mounted across the
  // app session (PaywallModalHost in _layout.tsx renders unconditionally), so
  // RN <Modal visible={false}> only hides the native chrome — useState slots
  // would otherwise persist into the next open with stale email + ticked consent
  // + stale success/error banner.
  //
  // GDPR Art. 7 (consent renewal) is the non-negotiable driver : a consent tick
  // inherited from a prior submission is NOT "specific + freely given" for the
  // NEW operation. The email + banner resets are justified separately by UX
  // trust (no zombie success/error on reopen) and KR4 funnel signal cleanliness
  // (one paywall_email_captured per actual submit, not phantom-inherited UX).
  //
  // Justification (eslint-disable react-hooks/set-state-in-effect) : the rule's
  // "you-might-not-need-an-effect" guidance does not apply here — `visible` is
  // a parent-owned prop driven by an out-of-tree event (axios 402 interceptor
  // → PaywallProvider.open). The reset is precisely the "synchronize React
  // state with an external system boundary event" pattern the rule's docs
  // exempt. Options (b) conditional mount and (c) key={openCounter} were
  // rejected per F2.md §3.1 (iOS RN Modal unmount-mid-animation race + late
  // setState warnings + TextInput focus loss). F2.md is the spec gate.
  // Approved-by: docs/roadmap-night/specs/F2.md §5 T2 (D1 option (a)).
  useEffect(() => {
    if (!visible) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setEmail('');
      setConsent(false);
      setWebsite('');
      setState('idle');
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [visible]);

  // F3 corrective (2026-05-16, ultrareview bug_010) — Format the BE-supplied
  // ISO `resetAt` via Intl.DateTimeFormat. R1 §3.4 D4 explicitly mandated this
  // but the original R1 green-agent shipped raw ISO interpolation, so users saw
  // "Resets on 2026-06-01T00:00:00.000Z" verbatim. The memoized formatter keys
  // on [resetAt, i18n.language] to avoid re-format thrash. Defensive fallback
  // returns raw ISO on parse or Intl failure (NOT empty string — surfaces BE
  // drift to QA rather than silently degrading).
  //
  // Dep extraction (resetAtIso primitive) — the React Compiler's
  // preserve-manual-memoization rule rejects the `reason?.resetAt` optional
  // chain in a deps array because it infers `reason` as the broader dep
  // (object-level). Lifting `resetAt` to a primitive const lets the compiler
  // and our memo agree on the same granular key, satisfying F3.N5 (per-tuple
  // memo) without weakening to `[reason, i18n.language]` reference instability.
  const resetAtIso = reason?.resetAt ?? '';
  const formattedReset = useMemo(() => {
    if (!resetAtIso) return '';
    try {
      const date = new Date(resetAtIso);
      if (Number.isNaN(date.getTime())) {
        // Defensive : invalid ISO → fall back to raw so a BE drift is visible
        // to QA rather than rendering "Invalid Date" or empty string.
        return resetAtIso;
      }
      return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(date);
    } catch {
      // Hermes Intl shouldn't throw on supported locales, but defensive fallback
      // keeps the modal usable if Intl is unexpectedly stripped (R1 §3.5 N3).
      return resetAtIso;
    }
  }, [resetAtIso, i18n.language]);

  const onSubmit = async (): Promise<void> => {
    if (!consent) return; // N6 — submit disabled until explicit consent.
    setState('sending');
    safeAddBreadcrumb({
      category: 'paywall',
      type: 'user',
      message: 'paywall_cta_clicked',
    });
    // Wave C5 / T-C54 — Plausible funnel emit (tier only ; NO email — PII strip
    // is defense-in-depth in both FE and BE adapters per PATTERNS.md §5 anti-1).
    void trackFunnelEvent('paywall_cta_clicked', {
      tier: reason?.tier ?? 'unknown',
    });
    try {
      await leadsApi.submitPaywallInterest({
        email,
        consent: true,
        website,
      });
      setState('success');
      safeAddBreadcrumb({
        category: 'paywall',
        type: 'info',
        message: 'paywall_email_captured',
      });
      // Wave C5 / T-C54 — second funnel event after successful capture.
      // Caller MUST NOT pass `email` ; the adapter would strip it anyway,
      // but we keep the call site clean as a code-review signal.
      void trackFunnelEvent('paywall_email_captured', {
        tier: reason?.tier ?? 'unknown',
      });
    } catch {
      setState('error');
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityRole="alert" testID="quota-upsell-modal">
          <View style={styles.headerRow}>
            <Text style={styles.title}>{t('paywall.modalTitle')}</Text>
            <Pressable
              onPress={onClose}
              accessibilityLabel={t('paywall.dismiss')}
              accessibilityRole="button"
              style={styles.closeButton}
              testID="quota-upsell-dismiss"
            >
              <Text style={styles.closeIcon}>×</Text>
            </Pressable>
          </View>

          <Text style={styles.body}>{t('paywall.modalBody')}</Text>
          {reason !== null && (
            <Text style={styles.meta}>
              {t('paywall.resetsOn')} {formattedReset}
            </Text>
          )}

          <Text style={styles.label}>{t('paywall.fieldEmail')}</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            accessibilityLabel={t('paywall.fieldEmail')}
            inputMode="email"
            autoCorrect={false}
            autoCapitalize="none"
            style={styles.input}
            testID="quota-upsell-email"
          />

          {/* Honeypot — `display:'none'` per StyleSheet ; never rendered to a11y. */}
          <TextInput
            value={website}
            onChangeText={setWebsite}
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={styles.honeypot}
          />

          <Pressable
            onPress={() => {
              setConsent((prev) => !prev);
            }}
            accessibilityLabel={t('paywall.consent')}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: consent }}
            style={styles.consentRow}
            testID="quota-upsell-consent"
          >
            <View style={[styles.checkbox, consent && styles.checkboxChecked]} />
            <Text style={styles.consentText}>{t('paywall.consent')}</Text>
          </Pressable>

          <Pressable
            onPress={() => {
              void onSubmit();
            }}
            accessibilityRole="button"
            style={styles.submitButton}
            testID="quota-upsell-submit"
          >
            <Text style={styles.submitText}>
              {state === 'sending' ? t('paywall.sending') : t('paywall.submit')}
            </Text>
          </Pressable>

          {state === 'success' && <Text style={styles.success}>{t('paywall.success')}</Text>}
          {state === 'error' && <Text style={styles.error}>{t('paywall.error')}</Text>}
        </View>
      </View>
    </Modal>
  );
}

// R1 (C6) — palette pinned at the module level so the StyleSheet stays
// free of inline color literals (react-native/no-color-literals). V1.1
// will move these to the shared theme tokens once the modal is themed.
const palette = {
  backdrop: 'rgba(0,0,0,0.4)',
  cardBg: '#fff',
  inputBorder: '#cbd5e1',
  checkboxBorder: '#475569',
  primary: '#1D4ED8',
  onPrimary: '#fff',
  success: '#15803d',
  error: '#b91c1c',
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: palette.backdrop,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: palette.cardBg,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 480,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  closeIcon: {
    fontSize: 24,
    lineHeight: 24,
  },
  body: {
    marginTop: 12,
    fontSize: 14,
  },
  meta: {
    marginTop: 8,
    fontSize: 12,
    opacity: 0.7,
  },
  label: {
    marginTop: 16,
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: palette.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  honeypot: {
    display: 'none',
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: palette.checkboxBorder,
    marginEnd: 8,
  },
  checkboxChecked: {
    backgroundColor: palette.primary,
    borderColor: palette.primary,
  },
  consentText: {
    fontSize: 13,
    flex: 1,
  },
  submitButton: {
    marginTop: 16,
    backgroundColor: palette.primary,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitText: {
    color: palette.onPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  success: {
    marginTop: 12,
    color: palette.success,
    fontSize: 13,
  },
  error: {
    marginTop: 12,
    color: palette.error,
    fontSize: 13,
  },
});
