import { useEffect } from 'react';
import { Redirect } from 'expo-router';

import { usePaywall } from '@/features/paywall/application/PaywallProvider';

/**
 * C2 — Dev-only Maestro trigger route for `QuotaUpsellModal`.
 *
 * The paywall modal is mounted globally in `app/_layout.tsx` (PaywallModalHost)
 * and is normally opened by the axios 402 interceptor → `usePaywall().open()`.
 * Spamming the chat API until the free quota is exhausted is slow (NFR-2
 * wall-time) and flaky in CI, so this route opens the modal directly via the
 * same `usePaywall().open(reason)` entry point.
 *
 * Reachable via deeplink `musaium:///(dev)/paywall-preview`. Renders nothing
 * itself — the modal is rendered above all routes by the global host.
 *
 * Gated on `__DEV__` (defence-in-depth: the parent `(dev)/_layout.tsx` already
 * redirects in release, this guard keeps the route inert even if reached).
 */
export default function PaywallPreviewRoute() {
  const { open } = usePaywall();

  useEffect(() => {
    if (!__DEV__) return;
    open({
      tier: 'free',
      currentCount: 5,
      limit: 5,
      // +24h from now so the modal's "resets on" line formats a future date.
      resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  }, [open]);

  if (!__DEV__) {
    return <Redirect href="/" />;
  }
  return null;
}
