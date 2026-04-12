import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Returns `true` when the OS-level "Reduce Motion" accessibility setting is
 * enabled (iOS: Settings → Accessibility → Motion, Android: Settings →
 * Accessibility → Remove animations).
 *
 * Consumers should short-circuit decorative animations when this returns true
 * (skeleton pulses, fade-ins, cursor blinks, crossfades). Gesture-driven
 * animations (pan responders, pinch-to-zoom) stay active — Reduce Motion
 * targets decorative motion, not interaction feedback.
 *
 * WCAG 2.1 AA criterion 2.3.3 ("Animation from Interactions").
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) setReduced(value);
      })
      .catch(() => {
        // Platform returns nothing on older Android — default to false.
      });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      if (mounted) setReduced(value);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
