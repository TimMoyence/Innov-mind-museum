import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ParseKeys } from 'i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { isAppError } from '@/shared/lib/errors';
import { semantic, space, fontSize } from '@/shared/ui/tokens';
import { GlassCard } from '@/shared/ui/GlassCard';
import { LiquidScreen } from '@/shared/ui/LiquidScreen';
import { pickMuseumBackground } from '@/shared/ui/liquidTheme';
import { useTheme } from '@/shared/ui/ThemeContext';

/** Outcome states of a one-shot token-exchange (auto-submit) screen. */
type Status = 'loading' | 'success' | 'invalidToken' | 'error';

/** i18n keys for the four-state copy + the post-success CTA. */
export interface TokenExchangeCopy {
  title: ParseKeys;
  loading: ParseKeys;
  success: ParseKeys;
  invalidToken: ParseKeys;
  error: ParseKeys;
  ctaLogin: ParseKeys;
}

interface TokenExchangeFlowProps {
  /** The one-time token from the route param (opaque; never logged — R13). */
  token: string | undefined;
  /** Posts the token to the backend; resolves on success, rejects on failure. */
  submit: (token: string) => Promise<unknown>;
  /** Localised copy keys for every state + the CTA. */
  copy: TokenExchangeCopy;
  /** Test ID prefix, e.g. `verify-email` → `verify-email-success`/`-cta`. */
  testIDPrefix: string;
  /** Invoked when the user taps the post-success / post-error CTA. */
  onContinue: () => void;
}

/**
 * Shared 4-state auto-submit flow for the `verify-email` and
 * `confirm-email-change` magic-link screens (design D5/D6). Mirrors the web
 * `EmailTokenFlow`: render `loading` synchronously when a token is present,
 * POST it on mount (guarded by a `cancelled` closure cell —
 * `feedback_closure_cell_cancellation_react_hooks`), and resolve to
 * `success | invalidToken | error`. A 400 backend error
 * (`isAppError(err) && err.status === 400`) maps to `invalidToken`; everything
 * else to `error` (design D4).
 *
 * The token is opaque to this component: it is forwarded verbatim to `submit`
 * and never logged, persisted, echoed in an a11y label, or rendered (R13).
 */
export function TokenExchangeFlow({
  token,
  submit,
  copy,
  testIDPrefix,
  onContinue,
}: TokenExchangeFlowProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [status, setStatus] = useState<Status>(token ? 'loading' : 'invalidToken');

  useEffect(() => {
    if (!token) return;
    const state = { cancelled: false };

    void (async () => {
      try {
        await submit(token);
        if (state.cancelled) return;
        setStatus('success');
      } catch (err) {
        if (state.cancelled) return;
        setStatus(isAppError(err) && err.status === 400 ? 'invalidToken' : 'error');
      }
    })();

    return () => {
      state.cancelled = true;
    };
    // `submit` is a stable wrapper; the token drives the single POST.
  }, [token, submit]);

  const iconName =
    status === 'success'
      ? 'checkmark-circle'
      : status === 'invalidToken'
        ? 'link'
        : status === 'error'
          ? 'warning'
          : 'hourglass';

  const messageKey =
    status === 'success'
      ? copy.success
      : status === 'invalidToken'
        ? copy.invalidToken
        : status === 'error'
          ? copy.error
          : copy.loading;

  const showCta = status !== 'loading';

  return (
    <LiquidScreen
      background={pickMuseumBackground(5)}
      contentStyle={[styles.screen, { paddingTop: insets.top + 8 }]}
    >
      <GlassCard style={styles.card} intensity={60}>
        <Text style={[styles.title, { color: theme.textPrimary }]} accessibilityRole="header">
          {t(copy.title)}
        </Text>

        <Ionicons
          name={iconName}
          size={48}
          color={status === 'success' ? theme.success : theme.textPrimary}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />

        <Text
          testID={status !== 'loading' ? `${testIDPrefix}-${status}` : undefined}
          style={[styles.message, { color: theme.textPrimary }]}
          accessibilityLiveRegion="polite"
          accessibilityRole="text"
        >
          {t(messageKey)}
        </Text>

        {showCta ? (
          <Pressable
            testID={`${testIDPrefix}-cta`}
            style={[styles.primaryButton, { backgroundColor: theme.primary }]}
            onPress={onContinue}
            accessibilityRole="button"
            accessibilityLabel={t(copy.ctaLogin)}
          >
            <Text style={[styles.primaryButtonText, { color: theme.primaryContrast }]}>
              {t(copy.ctaLogin)}
            </Text>
          </Pressable>
        ) : null}
      </GlassCard>
    </LiquidScreen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: space['4.5'],
    paddingBottom: semantic.screen.padding,
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    padding: semantic.card.paddingLarge,
    gap: semantic.card.gapSmall,
    alignItems: 'center',
  },
  title: {
    fontSize: fontSize['3xl'],
    fontWeight: '700',
    textAlign: 'auto',
  },
  message: {
    fontSize: fontSize.base,
    fontWeight: '600',
    textAlign: 'auto',
  },
  primaryButton: {
    marginTop: space['1'],
    borderRadius: semantic.button.radiusSmall,
    alignItems: 'center',
    paddingVertical: semantic.button.paddingY,
    paddingHorizontal: space['5.5'],
  },
  primaryButtonText: {
    fontWeight: '700',
    fontSize: semantic.button.fontSize,
  },
});
