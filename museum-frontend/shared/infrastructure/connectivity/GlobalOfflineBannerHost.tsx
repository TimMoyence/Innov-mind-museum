import type React from 'react';

import { useOfflineQueue } from '@/features/chat/application/useOfflineQueue';
import { OfflineBanner } from '@/features/chat/ui/OfflineBanner';

export const GlobalOfflineBannerHost: React.FC = () => {
  const { isOffline, pendingCount } = useOfflineQueue();
  return <OfflineBanner isOffline={isOffline} pendingCount={pendingCount} />;
};
