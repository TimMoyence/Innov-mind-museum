export type ResolvedDataMode = 'low' | 'normal';

type Listener = (mode: ResolvedDataMode) => void;

let currentMode: ResolvedDataMode = 'normal';
const listeners = new Set<Listener>();

export const getCurrentDataMode = (): ResolvedDataMode => currentMode;

export const setCurrentDataMode = (mode: ResolvedDataMode): void => {
  if (mode === currentMode) return;
  currentMode = mode;
  for (const listener of listeners) {
    try {
      listener(mode);
    } catch {}
  }
};

export const subscribeDataMode = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const __resetDataModeForTests = (): void => {
  currentMode = 'normal';
  listeners.clear();
};
