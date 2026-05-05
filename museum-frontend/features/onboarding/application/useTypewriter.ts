import { useCallback, useEffect, useRef, useState } from 'react';

interface UseTypewriterOptions {
  text: string;
  enabled: boolean;
  charDelayMs?: number;
  /** Delay before the first character appears. Defaults to `charDelayMs`. */
  startDelayMs?: number;
  onDone?: () => void;
}

interface UseTypewriterReturn {
  visible: string;
  isDone: boolean;
  reset: () => void;
}

/**
 * Reveals `text` character by character via chained timeouts.
 *
 * When `enabled` is false (e.g. OS reduced-motion), returns the full text
 * immediately and skips scheduling — honors WCAG 2.3.3 without the decorative
 * reveal. `reset()` restarts the reveal from the first character.
 */
export function useTypewriter({
  text,
  enabled,
  charDelayMs = 28,
  startDelayMs,
  onDone,
}: UseTypewriterOptions): UseTypewriterReturn {
  const firstCharDelayMs = startDelayMs ?? charDelayMs;
  const [visible, setVisible] = useState(() => (enabled ? '' : text));
  const [isDone, setIsDone] = useState(() => !enabled);
  const [runToken, setRunToken] = useState(0);
  const onDoneRef = useRef(onDone);

  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const reset = useCallback(() => {
    setVisible('');
    setIsDone(false);
    setRunToken((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;

    const revealChar = (index: number) => {
      if (cancelled) return;
      setVisible(text.slice(0, index));
      if (index >= text.length) {
        setIsDone(true);
        onDoneRef.current?.();
        return;
      }
      const timer = setTimeout(() => {
        revealChar(index + 1);
      }, charDelayMs);
      timers.push(timer);
    };

    // Reveal is driven exclusively by timer callbacks — no setState in effect
    // body, satisfying react-hooks/set-state-in-effect. State resets happen in
    // `reset()` (event-driven) and in the useState initializer.
    const startTimer = setTimeout(() => {
      revealChar(1);
    }, firstCharDelayMs);
    timers.push(startTimer);

    return () => {
      cancelled = true;
      for (const t of timers) clearTimeout(t);
    };
  }, [text, enabled, charDelayMs, firstCharDelayMs, runToken]);

  return { visible: enabled ? visible : text, isDone: enabled ? isDone : true, reset };
}
