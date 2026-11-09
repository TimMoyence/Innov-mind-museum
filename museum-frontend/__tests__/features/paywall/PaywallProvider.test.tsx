import '@/__tests__/helpers/test-utils';

const mockSetPaywallHandler = jest.fn();
jest.mock('@/shared/infrastructure/httpClient', () => ({
  setPaywallHandler: (fn: unknown) => mockSetPaywallHandler(fn),
}));

const mockAddBreadcrumb = jest.requireMock<{ addBreadcrumb: jest.Mock }>(
  '@sentry/react-native',
).addBreadcrumb;

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

  it('initial state is isOpen=false, reason=null', () => {
    const { result } = renderHook(() => usePaywall(), { wrapper });
    expect(result.current.isOpen).toBe(false);
    expect(result.current.reason).toBeNull();
  });

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
