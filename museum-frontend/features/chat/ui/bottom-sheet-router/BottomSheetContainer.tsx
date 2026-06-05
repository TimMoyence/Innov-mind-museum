import type React from 'react';
import { useEffect, useMemo, useRef } from 'react';
import type { AccessibilityRole, LayoutChangeEvent, PanResponderInstance } from 'react-native';
import { Animated, BackHandler, PanResponder, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';
import { useTheme } from '@/shared/ui/ThemeContext';

import { BottomSheetBackdrop } from './BottomSheetBackdrop';
import { dispatchBottomSheetEvent } from './bottomSheetStore';

type Presentation = 'sheet' | 'fullscreen' | 'card';

/**
 * Animation phase mirrored from the reducer's state shape. The container
 * plays the exit animation when it transitions to `closing` and dispatches
 * `CLOSE_DONE` once the animation settles (spec R12).
 */
export type BottomSheetContainerPhase = 'opening' | 'open' | 'closing';

interface BottomSheetContainerProps {
  presentation: Presentation;
  /**
   * When true, the container wires a `PanResponder` so the user can drag the
   * sheet down and dismiss it past the 50%-of-height threshold (spec R8). The
   * router computes this at mount: `presentation === 'sheet' && !blocking`.
   * The container itself never reads `blocking` — it just attaches or skips
   * the gesture handler.
   */
  enableSwipeDown: boolean;
  /**
   * Current animation phase. Driven by the router from the reducer state.
   * When this flips to `'closing'` the container plays its exit animation and
   * dispatches `CLOSE_DONE` to settle the state machine (spec R12).
   */
  phase: BottomSheetContainerPhase;
  accessibilityLabel?: string;
  onBackdropPress: () => void;
  onHardwareBack: () => void;
  children: React.ReactNode;
}

/** Swipe-down dismiss threshold = 50% of the measured sheet height (R8). */
const SWIPE_DISMISS_FRACTION = 0.5;
/** Minimum vertical travel before the responder claims the gesture (px). */
const SWIPE_CLAIM_THRESHOLD = 10;

/**
 * Visual shell that hosts the sheet content. Responsibilities:
 * - Render the backdrop and the sheet container with the correct shape per
 *   presentation kind (`sheet` = bottom slab, `card` = centered, `fullscreen`
 *   = full surface).
 * - Wire `BackHandler` (Android hardware back) — always consumed (`return
 *   true`) so Expo Router never pops the screen behind the sheet.
 * - Wire a vertical `PanResponder` for swipe-down dismiss on non-blocking
 *   `sheet` presentations (spec R8). The gesture maps `dy` to `translateY`,
 *   then either fires `onBackdropPress()` past 50% of the measured height or
 *   springs back to 0. Under Reduce Motion the spring is replaced by a
 *   `setValue` snap to keep the visual deterministic (spec R13).
 * - Drive the open/close animation lifecycle and dispatch `OPEN_DONE` /
 *   `CLOSE_DONE` to the store when each phase ends (spec R12). Decoupling the
 *   reducer from the animation means the queued route (R2 last-write-wins)
 *   only mounts once the closing animation has actually played.
 * - Apply `accessibilityViewIsModal` and `accessibilityRole="dialog"` (WCAG
 *   2.2 §4.1.2 — Name, Role, Value).
 *
 * Slide / fade animation is opacity + translateY only, `useNativeDriver: true`.
 * Under Reduce Motion (`useReducedMotion()`), the container snaps to its final
 * position with no `Animated.timing` call at all (AC6).
 */
export const BottomSheetContainer = ({
  presentation,
  enableSwipeDown,
  phase,
  accessibilityLabel,
  onBackdropPress,
  onHardwareBack,
  children,
}: BottomSheetContainerProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const opacity = useMemo(() => new Animated.Value(0), []);
  const translateY = useMemo(() => new Animated.Value(40), []);
  // Measured height of the sheet — used by the swipe-down threshold (R8).
  // Captured via `onLayout` so the threshold scales with the rendered slab.
  // We default to a large positive value pre-layout so the 50% comparison can
  // never trigger an accidental dismiss before measurement.
  const sheetHeightRef = useRef<number>(Number.POSITIVE_INFINITY);
  // Latest reduce-motion flag — read inside PanResponder release without
  // re-creating the responder on every change.
  const reduceMotionRef = useRef(reduceMotion);
  useEffect(() => {
    reduceMotionRef.current = reduceMotion;
  }, [reduceMotion]);
  // Latest backdrop handler — same rationale as `reduceMotionRef`.
  const onBackdropPressRef = useRef(onBackdropPress);
  useEffect(() => {
    onBackdropPressRef.current = onBackdropPress;
  }, [onBackdropPress]);

  // Entrance animation — runs once on mount, drives `opening → open`.
  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      translateY.setValue(0);
      // Even when motion is reduced, we still need the reducer to advance from
      // `opening` to `open` — dispatch the terminal event synchronously so the
      // state machine remains deterministic (spec R13 — "sequential snap, not
      // concurrent").
      dispatchBottomSheetEvent({ type: 'OPEN_DONE' });
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        // Spec R12: the reducer transitions `opening → open` only once the
        // entrance animation has settled, not the same tick as the OPEN event.
        dispatchBottomSheetEvent({ type: 'OPEN_DONE' });
      }
    });
    // Mount-once: capture identities at first paint, the animated values are
    // stable refs and `reduceMotion` is read on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only entrance animation; the closing phase has its own effect below. Approved-by: tim@2026-05-14
  }, []);

  // Exit animation — runs when the reducer transitions to `closing`. Once the
  // animation resolves we dispatch `CLOSE_DONE` so the reducer can advance to
  // `idle` (or `opening(queued)` for the chained replace case). This is the
  // spec R12 sequencing — the next route only mounts AFTER the exit anim
  // completes.
  useEffect(() => {
    if (phase !== 'closing') return;
    if (reduceMotion) {
      // Snap path — opacity already at 1, just dispatch the terminal event so
      // the reducer settles deterministically (spec R13).
      dispatchBottomSheetEvent({ type: 'CLOSE_DONE' });
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 40,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        dispatchBottomSheetEvent({ type: 'CLOSE_DONE' });
      }
    });
  }, [phase, reduceMotion, opacity, translateY]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onHardwareBack();
      // Always consume the event so Expo Router stack does not pop.
      return true;
    });
    return () => {
      sub.remove();
    };
  }, [onHardwareBack]);

  // Swipe-down dismiss (spec R8). Created lazily so we never attach a
  // responder when the route is blocking or the presentation does not warrant
  // one (`card`, `fullscreen` slide-from-bottom have no swipe affordance).
  const panResponder = useMemo<PanResponderInstance | null>(() => {
    if (!enableSwipeDown) return null;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // Claim the gesture only when the user makes a clear DOWNWARD drag —
      // small jitter is ignored so taps on children (CTA buttons) still fire.
      onMoveShouldSetPanResponder: (_evt, gestureState) =>
        gestureState.dy > SWIPE_CLAIM_THRESHOLD &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_evt, gestureState) => {
        // Only follow downward drag — upward attempts are clamped to 0 to
        // prevent the sheet rising above its rest position.
        const dy = gestureState.dy > 0 ? gestureState.dy : 0;
        translateY.setValue(dy);
      },
      onPanResponderRelease: (_evt, gestureState) => {
        const height = sheetHeightRef.current;
        const threshold = height * SWIPE_DISMISS_FRACTION;
        if (gestureState.dy > threshold) {
          // Past the dismiss threshold — let the router run its normal
          // backdrop-press path (which honours the non-blocking gate already).
          onBackdropPressRef.current();
          return;
        }
        // Spring-back. Under Reduce Motion: snap to 0 synchronously (spec R13).
        if (reduceMotionRef.current) {
          translateY.setValue(0);
          return;
        }
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        // Lost the gesture (e.g. another responder claimed it) — snap back so
        // we do not leave the sheet half-dragged.
        if (reduceMotionRef.current) {
          translateY.setValue(0);
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    });
  }, [enableSwipeDown, translateY]);

  const handleSheetLayout = useMemo(() => {
    if (!enableSwipeDown) return undefined;
    return (event: LayoutChangeEvent) => {
      const { height } = event.nativeEvent.layout;
      if (height > 0) {
        sheetHeightRef.current = height;
      }
    };
  }, [enableSwipeDown]);

  const presentationStyle = useMemo(() => {
    if (presentation === 'fullscreen') {
      return [styles.fullscreen, { backgroundColor: theme.cardBackground }];
    }
    if (presentation === 'card') {
      return [styles.cardWrap];
    }
    // 'sheet' presentation — bottom slab.
    return [styles.sheetWrap];
  }, [presentation, theme.cardBackground]);

  const innerStyle = useMemo(() => {
    if (presentation === 'card') {
      return [
        styles.card,
        { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
      ];
    }
    if (presentation === 'sheet') {
      return [
        styles.sheet,
        { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
      ];
    }
    // fullscreen: content covers the entire surface, no extra inner styling.
    return [styles.fullscreenInner];
  }, [presentation, theme.cardBackground, theme.cardBorder]);

  // `accessibilityViewIsModal` + `accessibilityRole="dialog"` live on the
  // outer wrapper so VoiceOver/TalkBack stop announcing the content behind
  // the sheet. The backdrop sits INSIDE this wrapper so it remains a child
  // of the modal — and remains discoverable by tests via testID (RNTL hides
  // siblings rendered outside an `accessibilityViewIsModal` boundary).
  // RN's `AccessibilityRole` type does not include "dialog" in the strict
  // export shipped with RN 0.83 (see `Libraries/Components/View/ViewAccessibility.d.ts`).
  // The runtime forwards it to the native ARIA layer regardless, and WCAG 2.2
  // §4.1.2 prescribes role="dialog" for modal containers. Cast to the
  // declared type — string cast, not `any`.
  const dialogRole = 'dialog' as AccessibilityRole;

  // `panHandlers` spread is empty when no responder is attached (blocking or
  // non-sheet presentation), so the JSX shape stays the same and React does
  // not have to flip handler identity between renders.
  const panHandlers = panResponder?.panHandlers ?? {};

  // Distinct dismiss label for the backdrop's tappable affordance (spec R12).
  // The outer wrapper keeps the sheet's announce label (used for dialog
  // discovery + tree-walk), while the backdrop's inner Pressable now carries
  // a discrete "Dismiss sheet" semantic so VoiceOver users do not hear the
  // dialog title twice when scrubbing to the close affordance.
  const dismissLabel = t('a11y.bottomSheet.dismiss');

  return (
    <View
      accessibilityViewIsModal
      accessibilityRole={dialogRole}
      accessibilityLabel={accessibilityLabel}
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
    >
      <BottomSheetBackdrop
        onPress={onBackdropPress}
        accessibilityLabel={accessibilityLabel}
        dismissLabel={dismissLabel}
      />
      <Animated.View
        style={[
          ...presentationStyle,
          {
            opacity,
            transform: [{ translateY }],
          },
        ]}
        // `box-none` on the wrap: the wrap (absoluteFill ancestor for the
        // `sheet`/`card`/`fullscreen` presentations) does NOT claim taps, so
        // taps that fall outside the visible slab reach the sibling backdrop
        // (spec R5/R6). The inner View below uses `auto` so the visible slab
        // still receives its own pressables + PanResponder gestures.
        pointerEvents="box-none"
        onLayout={handleSheetLayout}
        {...panHandlers}
      >
        <View style={innerStyle} pointerEvents="auto">
          {children}
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  fullscreen: {
    ...StyleSheet.absoluteFill,
  },
  fullscreenInner: {
    flex: 1,
  },
  cardWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sheetWrap: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
