import { Redirect, Stack } from 'expo-router';

/**
 * C2 — Dev-only route group `(dev)`.
 *
 * Hosts deeplink-triggerable preview routes used exclusively by Maestro E2E
 * flows to open modals whose production trigger is non-deterministic in CI
 * (QuotaUpsellModal = axios-402 interceptor ; OfflinePackPrompt = geo + MMKV
 * state). See `.maestro/MODAL_FLOWS_NOTES.md`.
 *
 * The whole group is gated on `__DEV__`: in a release bundle every route under
 * `(dev)/` redirects to `/`, so the preview routes are unreachable in prod and
 * carry zero risk of a phantom paywall/offline prompt. Mirrors the `__DEV__`
 * guard already used by `PerfOverlay` (`MuseumMapView.tsx`).
 *
 * Expo Router note: route groups `(name)` do not appear in the URL — these
 * routes are reached via `musaium:///(dev)/<route>` deeplinks (same custom
 * scheme + `openLink` pattern as `museum-picker-flow.yaml`).
 */
export default function DevLayout() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
