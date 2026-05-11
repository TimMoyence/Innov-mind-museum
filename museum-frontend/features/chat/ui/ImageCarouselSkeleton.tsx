/* eslint-disable react-hooks/refs -- Animated.Value refs are stable objects read once at creation; safe RN pattern. Approved-by: tim@2026-05-10 */
import React, { useEffect, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';
import { useTheme } from '@/shared/ui/ThemeContext';
import { radius, semantic, space } from '@/shared/ui/tokens';

const THUMB_HEIGHT = 120;
const THUMB_WIDTH = 120;
const SKELETON_THUMBS = 3;
const PULSE_DURATION_MS = 900;
const PULSE_OPACITY_LO = 0.45;
const PULSE_OPACITY_HI = 1;

/**
 * Pulsing placeholder thumb for `ImageCarouselSkeleton`. Memoized so the
 * Animated value is stable across re-renders.
 */
const SkeletonThumb = React.memo(({ surface }: { surface: string }) => {
  const reduceMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(reduceMotion ? PULSE_OPACITY_HI : PULSE_OPACITY_LO))
    .current;

  useEffect(() => {
    if (reduceMotion) return undefined;
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
      style={[
        styles.thumb,
        { backgroundColor: surface, opacity },
      ]}
    />
  );
});
SkeletonThumb.displayName = 'SkeletonThumb';

/**
 * Streaming placeholder rendered above the assistant body while
 * `isStreaming=true` — announces visually that contextual images are being
 * looked up. Swapped for the real `<ImageCarousel>` once the LLM finishes and
 * `metadata.images` hydrates.
 *
 * C2 v2 (2026-05) — Q1 RESOLVED option (b). Carousel position relative to the
 * text bubble is unchanged (still rendered above `StreamingBody`); only the
 * gating logic in `ChatMessageBubble` flips from `!isStreaming` to "skeleton
 * during streaming, real carousel after".
 *
 * Accessibility: container reports `accessibilityRole='progressbar'` and a
 * localized `accessibilityLabel`, keeping screen-reader users informed.
 */
export const ImageCarouselSkeleton = React.memo(() => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const accessibilityLabel = t('chat.enrichment.skeleton_loading');

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.content}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessible
      // Disable scroll — the skeleton is not interactive.
      scrollEnabled={false}
    >
      {Array.from({ length: SKELETON_THUMBS }).map((_, idx) => (
        <View key={idx} style={styles.thumbWrapper}>
          <SkeletonThumb surface={theme.surface} />
        </View>
      ))}
    </ScrollView>
  );
});
ImageCarouselSkeleton.displayName = 'ImageCarouselSkeleton';

const styles = StyleSheet.create({
  container: {
    marginBottom: semantic.chat.gap,
  },
  content: {
    flexDirection: 'row',
  },
  thumbWrapper: {
    marginRight: semantic.chat.gap,
  },
  thumb: {
    height: THUMB_HEIGHT,
    width: THUMB_WIDTH,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
});

// Re-export sizing for consumers that want to align placeholders.
export const SKELETON_THUMB_HEIGHT = THUMB_HEIGHT;
export const SKELETON_THUMB_WIDTH = THUMB_WIDTH;

// Suppress unused-warning in build w/o dev consumers (safe constant export).
void space;
