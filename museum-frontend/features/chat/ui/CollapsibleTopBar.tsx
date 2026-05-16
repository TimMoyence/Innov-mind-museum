import React, { useEffect, useMemo } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { ChatHeader, type ChatHeaderProps } from '@/features/chat/ui/ChatHeader';
import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';

/**
 * A4 — Top bar collapsible au scroll.
 *
 * Wraps `<ChatHeader>` in an `Animated.View` whose `height` transitions
 * between expanded (80dp) and collapsed (44dp) over 200ms when the
 * `collapsed` prop flips. `useNativeDriver: false` — height is a layout
 * property RN cannot animate on the native driver, and the transition is
 * ponctuelle (1× per hysteresis crossing), not per-frame.
 *
 * Reduced motion snaps to the target via `setValue` (WCAG 2.3.3).
 *
 * The AI disclosure badge + action buttons remain visible+tappable in both
 * states (EU AI Act Art.50 — R10/R19). `<ExpertiseBadge>` is hidden when
 * collapsed (R18). Title fontSize shrinks `2xl → base` (R17).
 *
 * Spec : `docs/chat-ux-refonte/specs/A4.md` §1.2 (R8-R15) + §4 (AC8-AC15).
 */

export const COLLAPSIBLE_TOP_BAR_EXPANDED_HEIGHT = 80;

export const COLLAPSIBLE_TOP_BAR_COLLAPSED_HEIGHT = 44;

export const COLLAPSIBLE_TOP_BAR_ANIM_DURATION_MS = 200;

export interface CollapsibleTopBarProps extends ChatHeaderProps {
  /**
   * Collapsed mini-bar mode. When `true`, the wrapper animates to the
   * collapsed height and forwards `collapsed={true}` to `<ChatHeader>`.
   * Defaults to `false` (expanded).
   */
  readonly collapsed?: boolean;
}

function CollapsibleTopBarImpl({ collapsed = false, ...headerProps }: CollapsibleTopBarProps) {
  const reducedMotion = useReducedMotion();
  // Animated.Value instance — created once via stable empty-deps useMemo so
  // React Compiler / react-hooks rules don't flag a ref read during render.
  // Mount-time value is the expanded height ; the effect below snaps it to
  // the collapsed value before the first paint if `collapsed` is true at
  // mount, then drives subsequent transitions.
  const heightValue = useMemo(() => new Animated.Value(COLLAPSIBLE_TOP_BAR_EXPANDED_HEIGHT), []);

  useEffect(() => {
    const target = collapsed
      ? COLLAPSIBLE_TOP_BAR_COLLAPSED_HEIGHT
      : COLLAPSIBLE_TOP_BAR_EXPANDED_HEIGHT;

    if (reducedMotion) {
      heightValue.setValue(target);
      return undefined;
    }

    const animation = Animated.timing(heightValue, {
      toValue: target,
      duration: COLLAPSIBLE_TOP_BAR_ANIM_DURATION_MS,
      useNativeDriver: false,
    });
    animation.start();

    return () => {
      animation.stop();
    };
  }, [collapsed, reducedMotion, heightValue]);

  return (
    <Animated.View testID="collapsible-top-bar" style={[styles.shell, { height: heightValue }]}>
      <ChatHeader {...headerProps} collapsed={collapsed} />
    </Animated.View>
  );
}

export const CollapsibleTopBar = React.memo(CollapsibleTopBarImpl);
CollapsibleTopBar.displayName = 'CollapsibleTopBar';

const styles = StyleSheet.create({
  shell: {
    overflow: 'hidden',
  },
});
