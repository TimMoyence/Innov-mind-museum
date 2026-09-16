import { Redirect, Stack } from 'expo-router';

import { areDevRoutesReachable } from '@/shared/lib/e2eBuildFlags';

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
 * The group is unreachable in a shipped app: every route under `(dev)/` redirects
 * to `/` unless this is a dev build OR a bundle explicitly built for the e2e suite.
 *
 * `__DEV__` ALONE is not the right gate, and the note above is exactly why. Both
 * e2e binaries are RELEASE builds (iOS `xcodebuild -configuration Release`,
 * Android weak-net `./gradlew assembleRelease`) → `--dev false` → `__DEV__ === false`
 * → these routes redirected Home there too. `force-data-mode` survived the H7
 * cleanup but inherited the same defect: the four `netshape` flows deeplink it, so
 * the low-data mode was never forced and their (non-optional) `low-data-badge`
 * assertion could not pass on EITHER platform. `areDevRoutesReachable()` adds the
 * build-time e2e seam (`EXPO_PUBLIC_E2E_DEV_ROUTES`, inlined by Metro, set only on
 * the Maestro build jobs) so an e2e Release bundle can reach them while a shipped
 * one still cannot — see `shared/lib/e2eBuildFlags.ts`.
 *
 * Expo Router note: route groups `(name)` do not appear in the URL — these
 * routes are reached via `musaium:///(dev)/<route>` deeplinks (same custom
 * scheme + `openLink` pattern as `museum-picker-flow.yaml`).
 */
export default function DevLayout() {
  if (!areDevRoutesReachable()) {
    return <Redirect href="/" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
