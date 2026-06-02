/**
 * RED — W1-DEV-01: dev route `app/(dev)/force-data-mode.tsx` (absent on RED HEAD).
 *
 * Deterministic low-data trigger for W3 Maestro netshape flows on iOS sim
 * (where NetInfo cannot be forced). spec.md R1-R4 / design.md §Architecture.
 *
 * Drives the REAL `useDataModePreferenceStore` (no inline store literal) and
 * asserts via `getState().preference` / a spy on `setPreference`, per zustand
 * testing discipline (lib-docs/zustand/PATTERNS.md:111 beforeEach setState
 * reset, :84/:116 getState non-reactive read, :109 module-level singleton).
 *
 * expo-router is mocked self-contained (NOT via shared test-utils, whose
 * `useLocalSearchParams` is non-configurable and exports no `Redirect`):
 * `Redirect` records its `href`, `router.replace` is a spy, and
 * `useLocalSearchParams` is driven per-test via a mutable holder — mirrors the
 * onboarding.test.tsx convention (lib-docs/expo-router/PATTERNS.md:42 <Redirect>,
 * :34 imperative router.replace, :37 useLocalSearchParams typed param).
 *
 * Renderer = `@testing-library/react-native` `render`/`act` (codebase standard,
 * e.g. consent-banner-flow.test.tsx:56, CollapsibleTopBar.test.tsx:234 unmount).
 * `react-test-renderer` is deprecated under the repo's `--max-warnings 0` lint
 * gate, so RNTL (which wraps mount in `act` internally) is used instead — same
 * observable contract: `render()` returns `{ unmount }`.
 *
 * 4 frozen cases (spec R1-R4):
 *   1. __DEV__=true + params{value:'low'} → setPreference('low') exactly once.
 *   2. renders a <Redirect> to '/' (or router.replace('/')).
 *   3. on unmount → setPreference('auto') (no leak across same-sim flows).
 *   4. __DEV__=false → <Redirect href="/"> AND setPreference NOT called.
 */
import { act, render } from '@testing-library/react-native';

import { useDataModePreferenceStore } from '@/features/settings/dataModeStore';

// ── expo-router mock (self-contained, configurable) ──────────────────────────
const mockSearchParams: { current: Record<string, string> } = { current: {} };
const mockRedirectHref: { current: string | null } = { current: null };

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockSearchParams.current,
  Redirect: ({ href }: { href: string }) => {
    mockRedirectHref.current = href;
    return null;
  },
}));

import { router as expoRouter } from 'expo-router';
const mockRouterReplace = expoRouter.replace as jest.Mock;

// Import the route under test AFTER the mock is registered. Absent on RED HEAD
// → this import throws at module resolution → every case fails (the RED state).
import ForceDataModeRoute from '@/app/(dev)/force-data-mode';

const ORIGINAL_DEV = (globalThis as unknown as { __DEV__: boolean }).__DEV__;

function setDev(value: boolean): void {
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = value;
}

describe('app/(dev)/force-data-mode route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams.current = {};
    mockRedirectHref.current = null;
    setDev(true);
    // Real store reset — singleton-leak guard (zustand PATTERNS.md:111).
    useDataModePreferenceStore.setState({ preference: 'auto' });
  });

  afterEach(() => {
    setDev(ORIGINAL_DEV);
  });

  it('R1 — __DEV__ + ?value=low calls setPreference("low") exactly once', () => {
    mockSearchParams.current = { value: 'low' };
    const setPreferenceSpy = jest.spyOn(useDataModePreferenceStore.getState(), 'setPreference');

    const view = render(<ForceDataModeRoute />);

    const lowCalls = setPreferenceSpy.mock.calls.filter(([p]) => p === 'low');
    expect(lowCalls).toHaveLength(1);
    expect(useDataModePreferenceStore.getState().preference).toBe('low');

    view.unmount();
  });

  it('R2 — redirects to "/" after setting the preference', () => {
    mockSearchParams.current = { value: 'low' };

    const view = render(<ForceDataModeRoute />);

    const redirectedHome = mockRedirectHref.current === '/';
    const replacedHome = mockRouterReplace.mock.calls.some(([href]) => href === '/');
    expect(redirectedHome || replacedHome).toBe(true);

    view.unmount();
  });

  it('R3 — resets preference to "auto" on unmount (no leak)', () => {
    mockSearchParams.current = { value: 'low' };
    const setPreferenceSpy = jest.spyOn(useDataModePreferenceStore.getState(), 'setPreference');

    const view = render(<ForceDataModeRoute />);

    act(() => {
      view.unmount();
    });

    const autoCalls = setPreferenceSpy.mock.calls.filter(([p]) => p === 'auto');
    expect(autoCalls).toHaveLength(1);
    expect(useDataModePreferenceStore.getState().preference).toBe('auto');
  });

  it('R4 — !__DEV__ renders <Redirect href="/"> and does NOT call setPreference', () => {
    setDev(false);
    mockSearchParams.current = { value: 'low' };
    const setPreferenceSpy = jest.spyOn(useDataModePreferenceStore.getState(), 'setPreference');

    const view = render(<ForceDataModeRoute />);

    expect(mockRedirectHref.current).toBe('/');
    expect(setPreferenceSpy).not.toHaveBeenCalled();

    view.unmount();
  });
});
