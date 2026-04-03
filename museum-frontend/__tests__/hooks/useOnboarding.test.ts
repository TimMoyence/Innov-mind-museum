import '@/__tests__/helpers/test-utils';
import { renderHook, act } from '@testing-library/react-native';
import { useOnboarding } from '@/features/onboarding/application/useOnboarding';

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useOnboarding', () => {
  const TOTAL_STEPS = 4;

  it('starts at step 0', () => {
    const { result } = renderHook(() => useOnboarding(TOTAL_STEPS));

    expect(result.current.currentStep).toBe(0);
    expect(result.current.isLast).toBe(false);
  });

  it('advances to the next step', () => {
    const { result } = renderHook(() => useOnboarding(TOTAL_STEPS));

    act(() => {
      result.current.next();
    });

    expect(result.current.currentStep).toBe(1);
  });

  it('does not advance past the last step', () => {
    const { result } = renderHook(() => useOnboarding(TOTAL_STEPS));

    // Advance to the last step
    act(() => {
      result.current.next();
      result.current.next();
      result.current.next();
    });

    expect(result.current.currentStep).toBe(3);
    expect(result.current.isLast).toBe(true);

    // Try to go beyond
    act(() => {
      result.current.next();
    });

    expect(result.current.currentStep).toBe(3);
  });

  it('goes back to the previous step', () => {
    const { result } = renderHook(() => useOnboarding(TOTAL_STEPS));

    act(() => {
      result.current.next();
      result.current.next();
    });

    expect(result.current.currentStep).toBe(2);

    act(() => {
      result.current.prev();
    });

    expect(result.current.currentStep).toBe(1);
  });

  it('does not go below step 0', () => {
    const { result } = renderHook(() => useOnboarding(TOTAL_STEPS));

    act(() => {
      result.current.prev();
    });

    expect(result.current.currentStep).toBe(0);
  });

  it('jumps to a specific valid step via goToStep', () => {
    const { result } = renderHook(() => useOnboarding(TOTAL_STEPS));

    act(() => {
      result.current.goToStep(2);
    });

    expect(result.current.currentStep).toBe(2);
  });

  it('ignores goToStep with out-of-range values', () => {
    const { result } = renderHook(() => useOnboarding(TOTAL_STEPS));

    act(() => {
      result.current.goToStep(10);
    });

    expect(result.current.currentStep).toBe(0);

    act(() => {
      result.current.goToStep(-1);
    });

    expect(result.current.currentStep).toBe(0);
  });

  it('reports isLast correctly at the final step', () => {
    const { result } = renderHook(() => useOnboarding(TOTAL_STEPS));

    expect(result.current.isLast).toBe(false);

    act(() => {
      result.current.goToStep(3);
    });

    expect(result.current.isLast).toBe(true);
  });

  it('works with a single step (totalSteps = 1)', () => {
    const { result } = renderHook(() => useOnboarding(1));

    expect(result.current.currentStep).toBe(0);
    expect(result.current.isLast).toBe(true);

    act(() => {
      result.current.next();
    });

    expect(result.current.currentStep).toBe(0);
    expect(result.current.isLast).toBe(true);
  });
});
