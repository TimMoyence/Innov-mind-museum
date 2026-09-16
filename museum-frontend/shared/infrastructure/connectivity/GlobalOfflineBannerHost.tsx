import type React from 'react';

import { useOfflineQueue } from '@/features/chat/application/useOfflineQueue';
import { OfflineBanner } from '@/features/chat/ui/OfflineBanner';
import { useConnectivity } from './useConnectivity';

/**
 * Global offline-banner host (spec R8/R10, design §D5). Mirrors the
 * `PaywallModalHost` pattern in `app/_layout.tsx`: a tiny layout-root component
 * that reads the canonical `isOnline` from {@link useConnectivity} and renders
 * the single, app-wide {@link OfflineBanner}. Mounting it once at the root means
 * the offline state is surfaced on EVERY screen — the chat screen no longer
 * mounts its own duplicate.
 *
 * OFFLINE-ONLY host (INV-12/INV-13, run `undefined-network-detection-reliability`):
 * the banner renders iff offline — it carries NO low-data UI. The low-data
 * indicator is the chat-scoped `LowDataBadge` (`features/chat/ui/LowDataBadge.tsx`),
 * mounted only by `app/(stack)/chat/[sessionId].tsx` (never on auth screens).
 *
 * The pending-message count comes from the shared queue provider so a message
 * queued by the chat screen is visible immediately in this global banner.
 * `OfflineBanner` itself returns `null` when online, so this host is
 * render-cheap when online. It must sit under `<ConnectivityProvider>` and
 * `<OfflineQueueProvider>`.
 */
export const GlobalOfflineBannerHost: React.FC = () => {
  const { isOnline } = useConnectivity();
  const { pendingCount } = useOfflineQueue();
  return <OfflineBanner isOffline={!isOnline} pendingCount={pendingCount} />;
};
