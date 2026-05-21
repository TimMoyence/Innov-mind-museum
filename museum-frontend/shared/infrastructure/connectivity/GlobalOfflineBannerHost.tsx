import type React from 'react';

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
 * The pending-message count is a chat-queue refinement (`useOfflineQueue`) that
 * only has meaning on the chat screen, so the global banner shows the offline
 * state without a count (`pendingCount={0}`). `OfflineBanner` itself returns
 * `null` when neither offline nor low-data, so this host is render-cheap when
 * online. It must sit under both `<ConnectivityProvider>` and
 * `<DataModeProvider>` (the banner also consumes `useDataMode()`).
 */
export const GlobalOfflineBannerHost: React.FC = () => {
  const { isOnline } = useConnectivity();
  return <OfflineBanner isOffline={!isOnline} pendingCount={0} />;
};
