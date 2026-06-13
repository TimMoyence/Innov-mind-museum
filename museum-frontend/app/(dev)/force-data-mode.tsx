// e2e-skip: dev-only deterministic low-data trigger route for W3 Maestro netshape flows; no user happy-path
import { useEffect } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

import { useDataModePreferenceStore } from '@/features/settings/dataModeStore';

/**
 * W1-DEV-01 — Dev-only Maestro trigger route for the low-data mode.
 *
 * iOS simulators cannot have their NetInfo connection type forced, so the
 * low-data banner (driven by `resolveDataMode(preference === 'low')`) never
 * lights deterministically in CI. This route mutates the REAL
 * `useDataModePreferenceStore` to a forced preference, then redirects home so
 * the next screen renders under the chosen data mode — deterministic for W3
 * Maestro netshape flows.
 *
 * Reachable via deeplink `musaium:///(dev)/force-data-mode?value=low`
 * (default `low`; `?value=normal` forces the normal path). Gated on `__DEV__`
 * both here (defense-in-depth, before any store mutation) and by the parent
 * `(dev)/_layout.tsx`, so it is unreachable in a release bundle.
 *
 * Self-resets the preference back to `'auto'` on unmount so a forced mode does
 * not leak into the next flow sharing the same simulator session (R6 no-leak)
 * — UNLESS `?persist=1` is passed (design P-01, run
 * `undefined-network-detection-reliability`): the `<Redirect>` below unmounts
 * this route immediately after mount, so without persistence the forced mode
 * is gone before a Maestro NON-optional assert can observe it (the low-data
 * badge assert in `net-chat-edge.yaml` would be indeterministic). A persisted
 * flow MUST clean up by re-triggering the deeplink WITHOUT `persist`
 * (`?value=normal`) — that mount's unmount cleanup restores `'auto'`. The
 * other net-* flows keep the transient default (optional asserts).
 *
 * See `.maestro/MODAL_FLOWS_NOTES.md` for the deeplink contract.
 */
export default function ForceDataModeRoute() {
  // Hooks must run unconditionally (rules-of-hooks); the release-bundle guard is
  // applied to the render output below and to the store mutation inside the
  // effect, so NO store write ever happens outside `__DEV__` (R4).
  const { value, persist } = useLocalSearchParams<{
    value?: 'low' | 'normal';
    persist?: string;
  }>();
  const forced = value === 'normal' ? 'normal' : 'low';
  const persistForced = persist === '1';

  useEffect(() => {
    if (!__DEV__) {
      return;
    }
    // Forced preference applied at mount for the deterministic deeplink trigger;
    // cleanup resets to `'auto'` (R6 no-leak across same-sim flows) unless
    // `persist=1` explicitly opted out (P-01 — deterministic Maestro assert).
    useDataModePreferenceStore.getState().setPreference(forced);
    if (persistForced) {
      return;
    }
    return () => {
      useDataModePreferenceStore.getState().setPreference('auto');
    };
  }, [forced, persistForced]);

  // Defense-in-depth: in a release bundle this route is unreachable (parent
  // `(dev)/_layout.tsx` already redirects); render redirects home regardless.
  return <Redirect href="/" />;
}
