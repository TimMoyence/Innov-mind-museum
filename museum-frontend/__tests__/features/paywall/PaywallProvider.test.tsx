/**
 * R1 RED — PaywallProvider (T1.9 — O in brief).
 *
 * Pins R1 §1 R24/R25 + §3.7 D7 down BEFORE implementation :
 *  - The provider exposes a context value `{ isOpen, open(info), close() }`.
 *  - On mount it registers a setter `setPaywallHandler(fn)` on the shared
 *    `httpClient` module ; on unmount it deregisters by calling
 *    `setPaywallHandler(null)`.
 *  - When the registered handler is invoked (by the 402 interceptor branch),
 *    the provider stores the `{ tier, currentCount, limit, resetAt }` payload
 *    and flips `isOpen=true`.
 *  - On open, the provider emits a Sentry breadcrumb
 *    `{ category: 'paywall', message: 'paywall_modal_shown' }` (R25 telemetry).
 *  - Initial state : `isOpen=false`, `reason=null`.
 *
 * MUST FAIL at baseline `cd7e22bc` — `museum-frontend/features/paywall/`
 * directory does not exist (verified : R1.md Appendix A "No paywall/
 * directory exists in features/").
 *
 * File ext is `.test.tsx` because the wrapper renders JSX. The brief's
 * `.test.ts` literal path was informal — Jest's testMatch accepts both
 * `.ts` and `.tsx`, and the test filter `paywall` matches the parent dir.
 */
import '@/__tests__/helpers/test-utils';

// ── Mocks ────────────────────────────────────────────────────────────────────

// R1 §3.7 D7 — provider wires + unwires via this setter, same setter-injection
// shape as `setUnauthorizedHandler` / `setAuthRefreshHandler`. Module added by
// T2 green agent. Mocked here so we can capture register / unregister calls.
const mockSetPaywallHandler = jest.fn();
jest.mock('@/shared/infrastructure/httpClient', () => ({
  setPaywallHandler: (fn: unknown) => mockSetPaywallHandler(fn),
}));

// Sentry breadcrumb sink — captured for R25 assertion.
const mockAddBreadcrumb = jest.fn();
jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: (b: unknown) => mockAddBreadcrumb(b),
}));

// The application surface under test. Module load fails at HEAD → RED.
import { PaywallProvider, usePaywall } from '@/features/paywall/application/PaywallProvider';

import { renderHook, act } from '@testing-library/react-native';
import type { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => (
  <PaywallProvider>{children}</PaywallProvider>
);

interface QuotaInfo {
  tier: string;
  currentCount: number;
  limit: number;
  resetAt: string;
}

describe('PaywallProvider (R1 §1 R24/R25 + §3.7 D7)', () => {
  beforeEach(() => {
    mockSetPaywallHandler.mockReset();
    mockAddBreadcrumb.mockReset();
  });

  // ── Setter registration lifecycle ────────────────────────────────────

  it('R25: registers a paywall handler on mount via setPaywallHandler(fn)', () => {
    renderHook(() => usePaywall(), { wrapper });
    expect(mockSetPaywallHandler).toHaveBeenCalledTimes(1);
    const firstArg = mockSetPaywallHandler.mock.calls[0]?.[0];
    expect(typeof firstArg).toBe('function');
  });

  it('R25: unregisters (setPaywallHandler(null)) on unmount', () => {
    const { unmount } = renderHook(() => usePaywall(), { wrapper });
    mockSetPaywallHandler.mockClear();
    unmount();
    expect(mockSetPaywallHandler).toHaveBeenCalledTimes(1);
    expect(mockSetPaywallHandler).toHaveBeenCalledWith(null);
  });

  // ── Initial state ────────────────────────────────────────────────────

  it('initial state is isOpen=false, reason=null', () => {
    const { result } = renderHook(() => usePaywall(), { wrapper });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.reason).toBeNull();
  });

  // ── Handler invocation propagates to context ─────────────────────────

  it('R24: invoking the registered handler flips isOpen=true + stores reason', () => {
    const { result } = renderHook(() => usePaywall(), { wrapper });
    const registered = mockSetPaywallHandler.mock.calls[0]?.[0] as
      | ((info: QuotaInfo) => void)
      | undefined;
    expect(typeof registered).toBe('function');

    act(() => {
      registered?.({
        tier: 'free',
        currentCount: 3,
        limit: 3,
        resetAt: '2026-06-01T00:00:00.000Z',
      });
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.reason).toEqual({
      tier: 'free',
      currentCount: 3,
      limit: 3,
      resetAt: '2026-06-01T00:00:00.000Z',
    });
  });

  // ── R25 — Sentry breadcrumb on open ──────────────────────────────────

  it("R25: emits Sentry breadcrumb { category:'paywall', message:'paywall_modal_shown' } on open", () => {
    renderHook(() => usePaywall(), { wrapper });
    const registered = mockSetPaywallHandler.mock.calls[0]?.[0] as
      | ((info: QuotaInfo) => void)
      | undefined;
    act(() => {
      registered?.({
        tier: 'free',
        currentCount: 3,
        limit: 3,
        resetAt: '2026-06-01T00:00:00.000Z',
      });
    });
    expect(mockAddBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'paywall',
        message: 'paywall_modal_shown',
      }),
    );
  });

  // ── close() resets state ─────────────────────────────────────────────

  it('close() resets isOpen=false (modal dismissible per Q7)', () => {
    const { result } = renderHook(() => usePaywall(), { wrapper });
    const registered = mockSetPaywallHandler.mock.calls[0]?.[0] as
      | ((info: QuotaInfo) => void)
      | undefined;
    act(() => {
      registered?.({
        tier: 'free',
        currentCount: 3,
        limit: 3,
        resetAt: '2026-06-01T00:00:00.000Z',
      });
    });
    expect(result.current.isOpen).toBe(true);
    act(() => {
      result.current.close();
    });
    expect(result.current.isOpen).toBe(false);
  });
});
