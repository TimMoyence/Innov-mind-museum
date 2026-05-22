import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as Sentry from '@sentry/react-native';

import { trackFunnelEvent } from '@/shared/analytics/plausible';
import { setPaywallHandler } from '@/shared/infrastructure/httpClient';

/**
 * Safe breadcrumb shim — different test mocks expose different Sentry surfaces
 * (the global test-utils mock omits `addBreadcrumb` ; per-test mocks add it).
 * Resolving lazily + optional-chain keeps the production path identical while
 * letting both mock shapes coexist.
 */
const safeAddBreadcrumb = (breadcrumb: {
  category: string;
  type?: string;
  message: string;
  data?: unknown;
}): void => {
  const sentry = Sentry as unknown as {
    addBreadcrumb?: (b: unknown) => void;
  };
  if (typeof sentry.addBreadcrumb === 'function') {
    sentry.addBreadcrumb(breadcrumb);
  }
};

import type { ReactNode } from 'react';

/**
 * R1 (C6) — Soft-paywall React Context for the mobile app. Wires the axios
 * 402 interceptor (via `setPaywallHandler`) to a modal-state toggle (`isOpen`)
 * + the quota payload (`reason`). Lives at the root of the layout tree (above
 * any screen) so the modal renders ABOVE all routes WITHOUT importing
 * anything from `features/chat/` (N2 strict isolation).
 *
 * Lifecycle :
 *  - mount → `setPaywallHandler((info) => { open(info) })`.
 *  - unmount → `setPaywallHandler(null)` (leak-safe).
 *  - open(info) → flips `isOpen=true`, stores `reason`, emits a Sentry
 *    breadcrumb `paywall_modal_shown` (R25 telemetry).
 *  - close() → resets `isOpen=false` (dismissible per Q7, mirror no-dark-pattern).
 */

interface QuotaReason {
  tier: string;
  currentCount: number;
  limit: number;
  resetAt: string;
}

interface PaywallContextValue {
  isOpen: boolean;
  reason: QuotaReason | null;
  open: (info: QuotaReason) => void;
  close: () => void;
}

const PaywallContext = createContext<PaywallContextValue | null>(null);

/** Provides `{isOpen, reason, open, close}` to descendants + wires the axios setter. */
export function PaywallProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<QuotaReason | null>(null);

  const open = useCallback((info: QuotaReason) => {
    setReason(info);
    setIsOpen(true);
    // R25 — Sentry breadcrumb on open. Crash reports carry the user journey
    // (modal-shown / cta-clicked / email-captured) for funnel reconstruction.
    safeAddBreadcrumb({
      category: 'paywall',
      type: 'info',
      message: 'paywall_modal_shown',
      data: info,
    });
    // Wave C5 / T-C54 — Plausible funnel emit alongside the Sentry breadcrumb.
    // Two channels, two purposes : breadcrumb = crash-report context (R25),
    // funnel event = KR4 dashboard signal. Fire-and-forget : `trackFunnelEvent`
    // contractually never throws + consent gate fail-closed before fetch
    // (PATTERNS.md §3.4). No PII in props (tier only — `info` carries
    // currentCount/limit/resetAt but no user identifier, so the cast is safe).
    void trackFunnelEvent('paywall_modal_shown', {
      tier: info.tier,
    });
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    setPaywallHandler((info) => {
      open(info);
    });
    return () => {
      setPaywallHandler(null);
    };
  }, [open]);

  const value = useMemo<PaywallContextValue>(
    () => ({ isOpen, reason, open, close }),
    [isOpen, reason, open, close],
  );

  return <PaywallContext.Provider value={value}>{children}</PaywallContext.Provider>;
}

/** Hook accessor for the paywall context (throws when used outside the provider). */
export function usePaywall(): PaywallContextValue {
  const ctx = useContext(PaywallContext);
  if (!ctx) {
    throw new Error('usePaywall must be used within a <PaywallProvider>');
  }
  return ctx;
}
