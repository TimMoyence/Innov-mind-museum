import { useState } from 'react';
import { Redirect } from 'expo-router';

import { OfflinePackPrompt } from '@/features/museum/ui/OfflinePackPrompt';

/**
 * C2 — Dev-only Maestro trigger route for `OfflinePackPrompt`.
 *
 * The real prompt is mounted by `MuseumMapView` only when geo resolves a
 * `nearestCity` AND MMKV reports the pack absent (`useOfflinePackPromptTrigger`
 * returns `'prompt'`) — non-deterministic in CI. This route mounts the prompt
 * directly in its initial accept/decline state.
 *
 * `packState={{ status: 'absent' }}` is the verified initial state of
 * `CityPackState` (`features/museum/application/useOfflinePacks.ts:11-14`): it
 * is the fallback branch of `OfflinePackPrompt.renderActions()` that renders the
 * accept/decline buttons. (The design draft said `{status:'idle'}`, but no such
 * variant exists in the union — `absent` is the correct idle state. Verified on
 * disk, UFR-013.)
 *
 * The `testID="museum-map-offline-prompt"` matches the prod call-site literal in
 * `MuseumMapView.tsx:297`, so the runtime-derived `${testID}-accept` /
 * `${testID}-decline` anchors resolve identically to production.
 *
 * Reachable via deeplink `musaium:///(dev)/offline-prompt-preview`. Gated on
 * `__DEV__` (parent `(dev)/_layout.tsx` redirects in release).
 */
export default function OfflinePromptPreviewRoute() {
  const [visible, setVisible] = useState(true);

  if (!__DEV__) {
    return <Redirect href="/" />;
  }

  const dismiss = (): void => {
    setVisible(false);
  };

  return (
    <OfflinePackPrompt
      visible={visible}
      cityName="Bordeaux"
      packState={{ status: 'absent' }}
      errorVisible={false}
      onAccept={dismiss}
      onDecline={dismiss}
      onRetry={() => {
        /* no-op in preview */
      }}
      onDismiss={dismiss}
      testID="museum-map-offline-prompt"
    />
  );
}
