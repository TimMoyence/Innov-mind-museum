import { Redirect, Stack } from 'expo-router';

/**
 * C2 — Dev-only route group `(dev)`.
 *
 * Hosts deeplink-triggerable dev routes used by Maestro E2E flows. The remaining
 * route is `force-data-mode.tsx` (W3 low-data preference forcing — iOS sims
 * cannot have their NetInfo connection type forced). See `.maestro/MODAL_FLOWS_NOTES.md`.
 *
 * NOTE (stream H7, 2026-06-14): the former `paywall-preview.tsx` /
 * `offline-prompt-preview.tsx` modal-trigger routes were REMOVED. They were
 * `__DEV__`-gated and redirected Home in a Release bundle, so the Maestro flows
 * that deeplinked them passed green VACUOUSLY on the Release APK (the modal never
 * opened). `modal-paywall-quota-upsell.yaml` now drives the REAL axios-402
 * paywall trigger (a pre-exhausted quota → `QuotaUpsellModal`), and the
 * offline-pack flow was dropped (no reliable Release trigger; geo + MMKV state).
 *
 * The whole group is gated on `__DEV__`: in a release bundle every route under
 * `(dev)/` redirects to `/`, so the dev routes are unreachable in prod. Mirrors
 * the `__DEV__` guard already used by `PerfOverlay` (`MuseumMapView.tsx`).
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
