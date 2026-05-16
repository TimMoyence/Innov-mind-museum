import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Returns `true` when the OS-level "Reduce Transparency" accessibility setting
 * is enabled (iOS: Settings → Accessibility → Display & Text Size → Reduce
 * Transparency). On Android, the API is absent → defaults to `false`.
 *
 * Consumers should fall back to opaque solid surfaces (no BlurView, no alpha)
 * when this returns true — translucent surfaces reduce text contrast and
 * cause visual fatigue for the targeted users.
 *
 * Sibling of `useReducedMotion` — same lifecycle pattern (mount fetch +
 * change listener + unmount cleanup + reject → false).
 *
 * WCAG 2.1 AA — informed by Apple HIG "Reduce Transparency" guidance.
 *
 * Spec : docs/chat-ux-refonte/specs/A3.md §1.1 (R1-R4).
 */
export function useReducedTransparency(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((value) => {
        if (mounted) setReduced(value);
      })
      .catch(() => {
        // On older Android targets the API is absent and the promise rejects —
        // default to `false` silently.
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      (value) => {
        if (mounted) setReduced(value);
      },
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
