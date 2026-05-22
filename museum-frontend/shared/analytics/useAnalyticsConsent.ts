import { useCallback, useEffect, useRef, useState } from 'react';

import { storage } from '@/shared/infrastructure/storage';

/**
 * Wave C5 / T-C54 — Analytics consent hook (GDPR Art. 7, opt-in by default).
 *
 * Lib-docs reference : `lib-docs/plausible/PATTERNS.md` §3.4 (shared consent
 * hook FE+web) + §4 (Musaium policy : explicit opt-out exposed even though
 * Plausible's cookieless processing is technically exempt from ePrivacy Art.
 * 5(3) consent cookie requirement).
 *
 * Storage : AsyncStorage (museum-frontend uses `@/shared/infrastructure/storage`
 * across the app — single boundary).
 *
 * The hook exposes:
 *  - `granted` : the in-memory cached value (initial `false` until hydration).
 *  - `grant()` / `revoke()` : imperative setters persisted to storage.
 *
 * The companion `hasAnalyticsConsent()` is a synchronous reader of an
 * in-memory cell — populated by the latest hook hydration AND by
 * `__setHasAnalyticsConsentForTest()` (test seam consumed by the frozen RED
 * test `plausible-consent.test.ts`). Production callers should prefer the
 * hook to benefit from React re-render on `grant/revoke`.
 */

const STORAGE_KEY = 'musaium.analytics.consent';
const VALUE_GRANTED = 'granted';
const VALUE_DENIED = 'denied';

/**
 * Tri-state consent status — TD-C5-MOBILE-CONSENT-01.
 *  - `unset`   : the user has never been asked (default on first launch) —
 *                the `ConsentBanner` renders.
 *  - `granted` : the user tapped "Accept" — funnel events flow.
 *  - `denied`  : the user tapped "Decline" — funnel events stay fail-closed
 *                and the banner does NOT re-appear on remount.
 */
export type AnalyticsConsentStatus = 'unset' | 'granted' | 'denied';

// Module-scope cell — last known consent state. Hydrated by the hook on mount,
// and mutated by grant()/decline(). Synchronous read via `hasAnalyticsConsent()`.
// Default `'unset'` so the banner shows on first launch (TD-C5-MOBILE-CONSENT-01).
let cachedStatus: AnalyticsConsentStatus = 'unset';

/** Synchronous consent reader used by `trackFunnelEvent` (no React context). */
export function hasAnalyticsConsent(): boolean {
  return cachedStatus === 'granted';
}

/** Synchronous status reader used by the banner host (no React context). */
export function getAnalyticsConsentStatus(): AnalyticsConsentStatus {
  return cachedStatus;
}

export interface AnalyticsConsentHookValue {
  /** Tri-state — TD-C5-MOBILE-CONSENT-01. */
  status: AnalyticsConsentStatus;
  /** Legacy boolean — kept for callers wired pre-TD. `true` iff `status === 'granted'`. */
  granted: boolean;
  /** Persist `'granted'` + populate the in-memory cell. */
  grant: () => void;
  /** Persist `'denied'` + populate the in-memory cell (banner won't re-appear). */
  decline: () => void;
  /** Legacy alias for {@link decline} — kept for callers wired pre-TD. */
  revoke: () => void;
}

export function useAnalyticsConsent(): AnalyticsConsentHookValue {
  // Initial state is ALWAYS `'unset'` (not the module-level `cachedStatus`)
  // so the banner re-renders on each fresh mount and the truth-source
  // becomes the storage hydration below. This prevents two pitfalls :
  //   (a) cross-test leakage in Jest where `cachedStatus` persists across
  //       `it()` blocks (the test suite cannot reset module-level state
  //       without `jest.resetModules`, which would break React rendering),
  //       and
  //   (b) the production case where a previous app session set `cachedStatus`
  //       to `'granted'`/`'denied'` but the user cleared app data — storage
  //       is now empty, and we want the banner to reappear.
  // The momentary "banner flash → null" on returning users is acceptable
  // because the hydration effect resolves in one microtask.
  const [status, setStatus] = useState<AnalyticsConsentStatus>('unset');
  // Tracks whether the user has acted (grant/decline) in THIS hook lifecycle.
  // Used to gate the hydration race-guard so storage truth wins on a fresh
  // mount even when the module-level `cachedStatus` cell was previously set
  // (e.g. across test cases in the same Jest process). Production semantics
  // are unchanged : a real user-acted lifecycle keeps `userActedRef = true`
  // until the component unmounts, blocking accidental overwrite from a late
  // hydration await.
  const userActedRef = useRef<boolean>(false);

  useEffect(() => {
    // Closure-cell cancellation flag — wrapped in an object so the post-await
    // read narrows correctly under `no-unnecessary-condition` (see memory
    // `feedback_closure_cell_cancellation_react_hooks`). Set to `true` by the
    // cleanup callback when the component unmounts before the async settles.
    const lifetime = { cancelled: false };
    void (async () => {
      try {
        const stored = await storage.getItem(STORAGE_KEY);
        if (lifetime.cancelled) return;
        // Race-guard : if THIS hook lifecycle already saw a user action
        // (grant() / decline() ran before the hydration await resolved), DO
        // NOT overwrite the decision. The synchronous user action took
        // precedence — production scenario where the user taps the banner
        // before the AsyncStorage `getItem` microtask resolves. Without this
        // guard, the late hydration would silently regress the decision back
        // to whatever storage held pre-tap.
        if (userActedRef.current) return;
        const next: AnalyticsConsentStatus =
          stored === VALUE_GRANTED ? 'granted' : stored === VALUE_DENIED ? 'denied' : 'unset';
        cachedStatus = next;
        setStatus(next);
      } catch {
        // Storage failure → keep default (opt-in posture, fail-closed).
      }
    })();
    return () => {
      lifetime.cancelled = true;
    };
  }, []);

  const grant = useCallback((): void => {
    userActedRef.current = true;
    cachedStatus = 'granted';
    setStatus('granted');
    void storage.setItem(STORAGE_KEY, VALUE_GRANTED).catch(() => {
      // Persistence failure is non-fatal — runtime state still reflects intent.
    });
  }, []);

  const decline = useCallback((): void => {
    userActedRef.current = true;
    cachedStatus = 'denied';
    setStatus('denied');
    void storage.setItem(STORAGE_KEY, VALUE_DENIED).catch(() => {
      // Persistence failure is non-fatal.
    });
  }, []);

  return {
    status,
    granted: status === 'granted',
    grant,
    decline,
    revoke: decline,
  };
}

/**
 * Test-only seam — lets the frozen RED test `plausible-consent.test.ts`
 * toggle consent without mounting React. Not exported from any public
 * barrel ; used internally by `plausible.ts` and the test file.
 *
 * @internal
 */
export function __setAnalyticsConsentForTest(value: boolean): void {
  cachedStatus = value ? 'granted' : 'unset';
}
