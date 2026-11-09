import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { useTranslation } from 'react-i18next';

import { trackFunnelEvent } from '@/shared/analytics/plausible';
import type { QuotaInfo } from '@/shared/types/quota-info';
import { formatAppDate } from '@/shared/lib/formatDate';
import { leadsApi } from '@/features/paywall/infrastructure/leadsApi';

interface QuotaUpsellModalProps {
  visible: boolean;
  reason: QuotaInfo | null;
  onClose: () => void;
}

type SubmitState = 'idle' | 'sending' | 'success' | 'error';

export function QuotaUpsellModal({ visible, reason, onClose }: QuotaUpsellModalProps) {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<SubmitState>('idle');

  const [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (!visible) {
      setEmail('');
      setConsent(false);
      setWebsite('');
      setState('idle');
    }
  }

  const resetAtIso = reason?.resetAt ?? '';
  const formattedReset = useMemo(
    () => formatAppDate(resetAtIso, i18n.language, { dateStyle: 'long' }),
    [resetAtIso, i18n.language],
  );

  const onSubmit = async (): Promise<void> => {
    if (!consent) return;
    setState('sending');
    Sentry.addBreadcrumb({
      category: 'paywall',
      type: 'user',
      message: 'paywall_cta_clicked',
    });
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
      Sentry.addBreadcrumb({
        category: 'paywall',
        type: 'info',
        message: 'paywall_email_captured',
      });
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
          {formattedReset ? (
            <Text style={styles.meta}>{t('paywall.resetsOn', { date: formattedReset })}</Text>
          ) : null}

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
