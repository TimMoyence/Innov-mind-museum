export type ResolvedDataMode = 'low' | 'normal';

type Listener = (mode: ResolvedDataMode) => void;

let currentMode: ResolvedDataMode = 'normal';
const listeners = new Set<Listener>();

/** Returns the current resolved data mode. Safe to call outside React. */
export const getCurrentDataMode = (): ResolvedDataMode => currentMode;

/**
 * Updates the current resolved data mode. Called by {@link DataModeProvider}
 * whenever the user preference or network conditions change. No-op when
 * the value is unchanged, so it is safe to call from a React effect on
 * every render.
 */
export const setCurrentDataMode = (mode: ResolvedDataMode): void => {
  if (mode === currentMode) return;
  currentMode = mode;
  for (const listener of listeners) {
    try {
      listener(mode);
    } catch {
      // A faulty subscriber must never break the setter chain.
    }
  }
};

/** Subscribes to data mode changes. Returns an unsubscribe function. */
export const subscribeDataMode = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Test-only: resets the module state between tests. */
export const __resetDataModeForTests = (): void => {
  currentMode = 'normal';
  listeners.clear();
};
