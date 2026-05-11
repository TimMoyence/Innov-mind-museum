/* eslint-disable react-hooks/refs -- Animated.Value refs are stable objects read once at creation; safe RN pattern. Approved-by: tim@2026-05-10 */
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';
import { useTheme } from '@/shared/ui/ThemeContext';
import { radius, semantic, space } from '@/shared/ui/tokens';

const CARD_WIDTH = 220;
const CARD_MIN_HEIGHT = 260;
const THUMB_HEIGHT = 140;
const PULSE_DURATION_MS = 900;
const PULSE_OPACITY_LO = 0.45;
const PULSE_OPACITY_HI = 1;

/**
 * Pulsing thumb placeholder for `ImageCompareCardSkeleton`. Carries the
 * `image` a11y role so screen readers announce the loading thumbnail and so
 * tests can target the animated element. Memoized so the Animated value is
 * stable across re-renders.
 *
 * Reduce-motion (WCAG 2.3.3 / 2.1 AA): when the OS-level "Reduce Motion"
 * setting is on, the pulse animation is short-circuited — opacity is forced
 * to the high value (1) and stays there.
 */
const SkeletonThumb = React.memo(({ surface }: { surface: string }) => {
  const reduceMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(reduceMotion ? PULSE_OPACITY_HI : PULSE_OPACITY_LO))
    .current;

  // WCAG 2.3.3: when reduce-motion turns on (possibly after the initial async
  // resolution of AccessibilityInfo.isReduceMotionEnabled()), pin the opacity
  // synchronously during the render phase so callers that await the next
  // render observe `_value === 1` without waiting for an effect tick.
  if (reduceMotion) {
    opacity.setValue(PULSE_OPACITY_HI);
  }

  useEffect(() => {
    if (reduceMotion) {
      // Effect cleanup is a no-op — the render-phase setValue above already
      // pinned the value; nothing to animate or tear down.
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: PULSE_OPACITY_HI,
          duration: PULSE_DURATION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: PULSE_OPACITY_LO,
          duration: PULSE_DURATION_MS,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [opacity, reduceMotion]);

  return (
    <Animated.View
      accessible
      accessibilityRole="image"
      style={[styles.thumb, { backgroundColor: surface, opacity }]}
    />
  );
});
SkeletonThumb.displayName = 'SkeletonThumb';

/**
 * Body line placeholder — non-pulsing rectangle used for the title/artist/
 * rationale skeleton lines. Decorative, no a11y role of its own (the
 * container `progressbar` already announces the loading state).
 */
const SkeletonLine = React.memo(
  ({ surface, width }: { surface: string; width: number | `${number}%` }) => (
    <View style={[styles.line, { backgroundColor: surface, width }]} />
  ),
);
SkeletonLine.displayName = 'SkeletonLine';

/**
 * Streaming placeholder rendered while the C3 visual-similarity compare
 * pipeline is in flight. Mirrors the layout of `ImageCompareCard` so the
 * swap to the real card is visually stable (no layout shift / CLS).
 *
 * Accessibility: container reports `accessibilityRole='progressbar'` with a
 * localized loading label. Inner thumb carries `accessibilityRole='image'`
 * so the reduce-motion test can assert the suppressed-pulse state.
 */
export const ImageCompareCardSkeleton = React.memo(() => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  // Reuse the C2 enrichment-skeleton i18n key — both surfaces communicate
  // the same "looking up similar artworks…" loading state to the user. Avoids
  // adding a near-duplicate key when copy can be shared (UFR-005).
  const accessibilityLabel = t('chat.enrichment.skeleton_loading');

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      style={styles.card}
    >
      <SkeletonThumb surface={theme.surface} />
      <View style={styles.body}>
        <SkeletonLine surface={theme.surface} width="80%" />
        <SkeletonLine surface={theme.surface} width="55%" />
        <SkeletonLine surface={theme.surface} width="95%" />
      </View>
    </View>
  );
});
ImageCompareCardSkeleton.displayName = 'ImageCompareCardSkeleton';

const styles = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    minHeight: CARD_MIN_HEIGHT,
    marginRight: semantic.chat.gap,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  thumb: {
    width: CARD_WIDTH,
    height: THUMB_HEIGHT,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
  },
  body: {
    paddingHorizontal: semantic.card.padding,
    paddingVertical: semantic.card.paddingCompact,
    gap: space['2'],
  },
  line: {
    height: space['3'],
    borderRadius: radius.sm,
  },
});
