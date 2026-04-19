import '@/__tests__/helpers/test-utils';
import { renderHook, act } from '@testing-library/react-native';
import { useTypewriter } from '@/features/onboarding/application/useTypewriter';

describe('useTypewriter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reveals text char by char when enabled', () => {
    const { result } = renderHook(() =>
      useTypewriter({ text: 'abc', enabled: true, charDelayMs: 10 }),
    );

    expect(result.current.visible).toBe('');
    expect(result.current.isDone).toBe(false);

    act(() => {
      jest.advanceTimersByTime(10);
    });
    expect(result.current.visible).toBe('a');

    act(() => {
      jest.advanceTimersByTime(10);
    });
    expect(result.current.visible).toBe('ab');

    act(() => {
      jest.advanceTimersByTime(10);
    });
    expect(result.current.visible).toBe('abc');

    act(() => {
      jest.advanceTimersByTime(10);
    });
    expect(result.current.isDone).toBe(true);
  });

  it('returns full text instantly when disabled (reduced motion)', () => {
    const { result } = renderHook(() =>
      useTypewriter({ text: 'hello', enabled: false, charDelayMs: 100 }),
    );

    expect(result.current.visible).toBe('hello');
    expect(result.current.isDone).toBe(true);
  });

  it('calls onDone once reveal completes', () => {
    const onDone = jest.fn();
    renderHook(() => useTypewriter({ text: 'hi', enabled: true, charDelayMs: 5, onDone }));

    expect(onDone).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('reset restarts the reveal', () => {
    const { result } = renderHook(() =>
      useTypewriter({ text: 'xy', enabled: true, charDelayMs: 10 }),
    );

    act(() => {
      jest.advanceTimersByTime(40);
    });
    expect(result.current.visible).toBe('xy');
    expect(result.current.isDone).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.visible).toBe('');
    expect(result.current.isDone).toBe(false);

    act(() => {
      jest.advanceTimersByTime(40);
    });
    expect(result.current.visible).toBe('xy');
    expect(result.current.isDone).toBe(true);
  });

  it('cleans up timers on unmount', () => {
    const onDone = jest.fn();
    const { unmount } = renderHook(() =>
      useTypewriter({ text: 'abcdef', enabled: true, charDelayMs: 10, onDone }),
    );

    unmount();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(onDone).not.toHaveBeenCalled();
  });

  it('honors startDelayMs before first char', () => {
    const { result } = renderHook(() =>
      useTypewriter({ text: 'a', enabled: true, charDelayMs: 10, startDelayMs: 50 }),
    );

    expect(result.current.visible).toBe('');

    act(() => {
      jest.advanceTimersByTime(40);
    });
    expect(result.current.visible).toBe('');

    act(() => {
      jest.advanceTimersByTime(10);
    });
    expect(result.current.visible).toBe('a');
  });
});
