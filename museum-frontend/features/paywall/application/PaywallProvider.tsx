import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as Sentry from '@sentry/react-native';

import { trackFunnelEvent } from '@/shared/analytics/plausible';
import { setPaywallHandler } from '@/shared/infrastructure/httpClient';
import type { QuotaInfo } from '@/shared/types/quota-info';

import type { ReactNode } from 'react';

interface PaywallContextValue {
  isOpen: boolean;
  reason: QuotaInfo | null;
  open: (info: QuotaInfo) => void;
  close: () => void;
}

const PaywallContext = createContext<PaywallContextValue | null>(null);

export function PaywallProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<QuotaInfo | null>(null);

  const open = useCallback((info: QuotaInfo) => {
    setReason(info);
    setIsOpen(true);
    Sentry.addBreadcrumb({
      category: 'paywall',
      type: 'info',
      message: 'paywall_modal_shown',
      data: info,
    });
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

export function usePaywall(): PaywallContextValue {
  const ctx = useContext(PaywallContext);
  if (!ctx) {
    throw new Error('usePaywall must be used within a <PaywallProvider>');
  }
  return ctx;
}
