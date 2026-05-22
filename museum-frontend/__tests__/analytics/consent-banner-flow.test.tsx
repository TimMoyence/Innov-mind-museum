/**
 * TD-C5-MOBILE-CONSENT-01 RED — Consent banner UI flow (mini-cycle).
 *
 * Pins the missing UI surface called out by the Wave C5 reviewer
 * (`code-review-wave-c5.json` → finding TD-C5-MOBILE-CONSENT-01) :
 * `useAnalyticsConsent` (hook) + i18n strings shipped Wave C5, BUT no UI
 * mounts the banner → funnel signals = 0 in prod. Green must ship a banner
 * component that consumes the hook and is mountable from the root layout.
 *
 * Lib-docs consulted : `lib-docs/plausible/PATTERNS.md` §3.4 (consent gate
 * UX : explicit opt-in/opt-out CTAs, persisted decision, banner dismissed
 * after either choice) + §4 (Musaium policy : transparent opt-out exposed
 * even though Plausible cookieless is technically exempt from ePrivacy
 * Art. 5(3)).
 *
 * Three pinned invariants (TD-C5-MOBILE-CONSENT-01) :
 *
 *  1. Default state = banner VISIBLE when `useAnalyticsConsent().status`
 *     is `'unset'` (user has not yet chosen). This is the "0 funnel signals
 *     in prod" regression anchor : without this, the hook never sees a
 *     grant() call so trackFunnelEvent stays fail-closed forever.
 *
 *  2. Tap "Accept" → `useAnalyticsConsent().grant()` invoked, banner is
 *     dismissed (not visible after), and the persisted secure-store value
 *     is `'granted'` (verified via the AsyncStorage mock).
 *
 *  3. Tap "Decline" → `useAnalyticsConsent().revoke()` invoked, banner is
 *     dismissed, consent NOT granted (consent stays `false` per default
 *     opt-in posture). Banner does not re-appear on remount (status is no
 *     longer `'unset'` — it's `'denied'`).
 *
 * RED state — at HEAD `52a270864` the SUT is absent :
 *  - `museum-frontend/shared/analytics/ConsentBanner.tsx` does NOT exist
 *    (verified via `ls museum-frontend/shared/analytics/`). Jest `require()`
 *    of the SUT throws "Cannot find module" → suite errors at the FIRST
 *    `loadConsentBannerSut()` call in each `it`.
 *  - `useAnalyticsConsent` currently exposes `{granted, grant, revoke}` —
 *    NO `status` field. The TD calls for an extended surface
 *    `{status: 'unset' | 'granted' | 'denied', grant(), decline()}` so the
 *    banner can distinguish "user hasn't chosen yet" from "user said no".
 *    The hook extension is implicit in T-1's `grant()`/`decline()` calls
 *    and the `status === 'unset'` visibility predicate.
 *
 * Frozen-test invariant (UFR-022 phase red) : this file is immutable
 * byte-for-byte once committed. A green agent that suspects a test is wrong
 * MUST emit `BLOCK-TEST-WRONG <path>:<line> <reason>` and let the dispatcher
 * re-spawn a fresh red phase. NEVER edit this file from a green/reviewer
 * phase.
 *
 * Test runner : Jest (jest-expo preset). Scoped run :
 *   cd museum-frontend && npm test -- --testPathPattern=consent-banner-flow
 */

import '@/__tests__/helpers/test-utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import type { ComponentType } from 'react';

// ── Constants ────────────────────────────────────────────────────────────────
//
// The AsyncStorage key the green hook uses to persist the decision. Verified
// against `museum-frontend/shared/analytics/useAnalyticsConsent.ts` at HEAD
// (`STORAGE_KEY = 'musaium.analytics.consent'`). Green MUST keep this key —
// changing it would orphan every consent decision already collected by users
// who upgraded from the Wave C5 build.
const CONSENT_STORAGE_KEY = 'musaium.analytics.consent';
const VALUE_GRANTED = 'granted';

// ── SUT loader ───────────────────────────────────────────────────────────────
//
// The green contract pinned here :
//   @/shared/analytics/ConsentBanner
//     export const ConsentBanner: React.ComponentType<{}>;
//     // Renders nothing when consent status !== 'unset'. Renders a banner
//     // with two CTAs ('analyticsConsent.optIn' / 'analyticsConsent.optOut')
//     // when status === 'unset'. Wires the CTAs to the hook grant()/decline().
//
//   @/shared/analytics/useAnalyticsConsent
//     export function useAnalyticsConsent(): {
//       status: 'unset' | 'granted' | 'denied';
//       granted: boolean;          // legacy field — kept for callers wired
//                                  // before TD-C5-MOBILE-CONSENT-01.
//       grant: () => void;
//       decline: () => void;       // new — TD-C5-MOBILE-CONSENT-01.
//       revoke?: () => void;       // legacy alias for `decline`.
//     };

interface BannerSut {
  ConsentBanner: ComponentType<Record<string, never>>;
}

function loadConsentBannerSut(): BannerSut {
  const mod = require('@/shared/analytics/ConsentBanner') as Partial<BannerSut>;
  if (typeof mod.ConsentBanner !== 'function') {
    throw new Error(
      'Green contract violation: `@/shared/analytics/ConsentBanner` must export a `ConsentBanner` React component (TD-C5-MOBILE-CONSENT-01).',
    );
  }
  return mod as BannerSut;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('TD-C5-MOBILE-CONSENT-01 — ConsentBanner UI flow', () => {
  beforeEach(async () => {
    // Reset the AsyncStorage mock between cases so each test starts from a
    // pristine "no decision recorded" baseline. The jest-expo preset auto-
    // wires `@react-native-async-storage/async-storage` to the async-storage
    // jest mock (see jest.config.js moduleNameMapper).
    await AsyncStorage.clear();
    // NB : `jest.resetModules()` is intentionally NOT called here. It would
    // split the React/react-test-renderer module instances between the top-
    // level `render` import and the `require()`-loaded SUT, causing the
    // renderer to detach mid-`act` ("Can't access .root on unmounted test
    // renderer"). The hook's in-memory `cachedStatus` is reset implicitly
    // because each test clears AsyncStorage and the hook re-hydrates on
    // mount — the only edge case is test-3's cross-render assertion, which
    // we handle by toggling the hook's status to 'denied' via the tap then
    // observing the persisted decision survives a fresh render.
  });

  afterEach(async () => {
    await AsyncStorage.clear();
  });

  // ── Invariant 1 — default state = banner VISIBLE on `unset` status ──────

  it('default (no decision yet) → banner is VISIBLE with both CTAs', async () => {
    const { ConsentBanner } = loadConsentBannerSut();

    // Render — RNTL `render()` already wraps in act() internally, so we do
    // not double-wrap. The hook's storage hydration runs in a useEffect ;
    // we wait for the banner to be visible (default is 'unset' until proven
    // otherwise) which is true synchronously because `cachedStatus` defaults
    // to 'unset' and AsyncStorage was cleared in beforeEach.
    render(<ConsentBanner />);

    // i18n keys verified against `museum-frontend/shared/locales/{fr,en}/paywall.json`
    // namespace `analyticsConsent` (title / description / optIn / optOut).
    // The shared test-utils i18n mock returns the key verbatim, so we assert
    // on the key string. `waitFor` absorbs the (no-op) post-mount hydration
    // microtask cleanly so we don't observe an intermediate flicker.
    await waitFor(() => {
      expect(screen.getByText('paywall.analyticsConsent.title')).toBeTruthy();
    });
    expect(screen.getByText('paywall.analyticsConsent.description')).toBeTruthy();
    expect(screen.getByText('paywall.analyticsConsent.optIn')).toBeTruthy();
    expect(screen.getByText('paywall.analyticsConsent.optOut')).toBeTruthy();
  });

  // ── Invariant 2 — Accept → grant() + dismiss + persist ───────────────────

  it('tap Accept → grant() persists "granted" in AsyncStorage + banner dismissed', async () => {
    const { ConsentBanner } = loadConsentBannerSut();
    render(<ConsentBanner />);

    // Tap "Accept" (i18n key resolves to itself in tests).
    fireEvent.press(screen.getByText('paywall.analyticsConsent.optIn'));

    // (a) AsyncStorage now persists the grant decision (the hook's `grant()`
    //     call writes `'granted'` to `STORAGE_KEY`). The setItem call is
    //     fire-and-forget inside the hook — we wait for it to settle.
    await waitFor(async () => {
      const stored = await AsyncStorage.getItem(CONSENT_STORAGE_KEY);
      expect(stored).toBe(VALUE_GRANTED);
    });

    // (b) Banner is dismissed — the title (only rendered when status==='unset')
    //     must no longer be in the tree. The hook's setStatus dispatch flushes
    //     through act on the next microtask ; `waitFor` absorbs that tick.
    await waitFor(() => {
      expect(screen.queryByText('paywall.analyticsConsent.title')).toBeNull();
    });
  });

  // ── Invariant 3 — Decline → revoke()/decline() + dismiss + never re-show ──

  it('tap Decline → consent NOT persisted as granted + banner dismissed + does not re-appear on remount', async () => {
    const { ConsentBanner } = loadConsentBannerSut();
    const first = render(<ConsentBanner />);

    fireEvent.press(screen.getByText('paywall.analyticsConsent.optOut'));

    // (a) Storage value is anything OTHER than 'granted' (could be `'denied'`,
    //     could be null if `decline()` simply removes the key — both are valid
    //     per the green contract, as long as it is NOT `'granted'`).
    await waitFor(async () => {
      const storedAfterDecline = await AsyncStorage.getItem(CONSENT_STORAGE_KEY);
      expect(storedAfterDecline).not.toBe(VALUE_GRANTED);
    });

    // (b) Banner dismissed (await the setStatus flush).
    await waitFor(() => {
      expect(screen.queryByText('paywall.analyticsConsent.title')).toBeNull();
    });

    // (c) The decline decision persists across remounts — banner does NOT
    //     re-appear when the user navigates away and back. This requires the
    //     hook to track `'denied'` as a terminal status (NOT `'unset'`).
    //     Unmount the first render then re-render — the new instance reads
    //     the in-memory `cachedStatus` (now 'denied') AND re-hydrates from
    //     AsyncStorage on mount ; both paths MUST yield status !== 'unset'.
    first.unmount();

    render(<ConsentBanner />);

    // After hydration, the banner is suppressed — the title text is absent.
    // We use `waitFor` to absorb the post-mount hydration tick deterministically.
    await waitFor(() => {
      expect(screen.queryByText('paywall.analyticsConsent.title')).toBeNull();
    });
  });

  // Type-only reference so the unused `act` import doesn't trip lint — kept
  // available for future test cases that need explicit act wrapping.
  void act;
});
