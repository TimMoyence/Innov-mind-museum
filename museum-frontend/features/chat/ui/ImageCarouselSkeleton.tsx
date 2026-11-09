import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { HorizontalStrip } from '@/shared/ui/HorizontalStrip';
import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';
import { useTheme } from '@/shared/ui/ThemeContext';
import { radius, semantic, space } from '@/shared/ui/tokens';

const THUMB_HEIGHT = 120;
const THUMB_WIDTH = 120;
const SKELETON_THUMBS = 3;
const PULSE_DURATION_MS = 900;
const PULSE_OPACITY_LO = 0.45;
const PULSE_OPACITY_HI = 1;

const SkeletonThumb = React.memo(({ surface }: { surface: string }) => {
  const reduceMotion = useReducedMotion();
  const [opacity] = useState(
    () => new Animated.Value(reduceMotion ? PULSE_OPACITY_HI : PULSE_OPACITY_LO),
  );

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

  return <Animated.View style={[styles.thumb, { backgroundColor: surface, opacity }]} />;
});
SkeletonThumb.displayName = 'SkeletonThumb';

export const ImageCarouselSkeleton = React.memo(() => {
  const { theme } = useTheme();
  const { t } = useTranslation();

  const accessibilityLabel = t('chat.enrichment.skeleton_loading');

  return (
    <HorizontalStrip
      contentContainerStyle={styles.content}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessible
      scrollEnabled={false}
    >
      {Array.from({ length: SKELETON_THUMBS }).map((_, idx) => (
        <View key={idx} style={styles.thumbWrapper}>
          <SkeletonThumb surface={theme.surface} />
        </View>
      ))}
    </HorizontalStrip>
  );
});
ImageCarouselSkeleton.displayName = 'ImageCarouselSkeleton';

const styles = StyleSheet.create({
  content: {
    flexDirection: 'row',
  },
  thumbWrapper: {
    marginEnd: semantic.chat.gap,
  },
  thumb: {
    height: THUMB_HEIGHT,
    width: THUMB_WIDTH,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
});

export const SKELETON_THUMB_HEIGHT = THUMB_HEIGHT;
export const SKELETON_THUMB_WIDTH = THUMB_WIDTH;

void space;
