/* eslint-disable react-hooks/refs -- Animated.Value refs are stable objects read once at creation; safe RN pattern */
import React, { useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';

import type { ChatUiEnrichedImage } from '@/features/chat/application/chatSessionLogic.pure';
import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';
import { useTheme } from '@/shared/ui/ThemeContext';
import { semantic, space, radius } from '@/shared/ui/tokens';

const ATTRIBUTION_BG = 'rgba(0,0,0,0.5)';
const ATTRIBUTION_COLOR = semantic.fullscreenModal.background;

interface ImageCarouselProps {
  images: ChatUiEnrichedImage[];
  onImagePress: (index: number) => void;
}

const THUMB_HEIGHT = 120;
const THUMB_WIDTH = 120;

/** Fade-in thumbnail with loading placeholder. */
const CarouselThumb = React.memo(
  ({
    image,
    index,
    onPress,
    placeholderBg,
  }: {
    image: ChatUiEnrichedImage;
    index: number;
    onPress: (index: number) => void;
    placeholderBg: string;
  }) => {
    const { t } = useTranslation();
    const reduceMotion = useReducedMotion();
    const opacity = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;

    const handleLoad = () => {
      if (reduceMotion) {
        // WCAG 2.3.3: show the thumbnail instantly, no fade-in.
        opacity.setValue(1);
        return;
      }
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    };

    // C2 v2 (2026-05) — render LLM-authored rationale under the thumb. Falls
    // back to the i18n string when missing (legacy responses or empty).
    const rationaleResolved =
      image.rationale && image.rationale.trim().length > 0
        ? image.rationale
        : t('chat.enrichment.rationale_fallback');
    const a11yLabel = `${image.caption} - ${rationaleResolved}`;

    return (
      <Pressable
        onPress={() => {
          onPress(index);
        }}
        accessibilityRole="image"
        accessibilityLabel={a11yLabel}
        accessibilityHint={t('chat.viewFullscreen')}
        style={styles.thumbPressable}
      >
        <View style={[styles.thumbContainer, { backgroundColor: placeholderBg }]}>
          <Animated.View style={{ opacity }}>
            <Image
              source={{ uri: image.thumbnailUrl }}
              style={styles.thumbImage}
              contentFit="cover"
              recyclingKey={image.url}
              cachePolicy="memory-disk"
              onLoad={handleLoad}
            />
          </Animated.View>
          {image.source === 'unsplash' && image.attribution ? (
            <View style={styles.attributionOverlay}>
              <Text style={styles.attributionText} numberOfLines={1}>
                {image.attribution}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.rationaleContainer}>
          <Text numberOfLines={2} ellipsizeMode="tail" style={styles.rationaleText}>
            {rationaleResolved}
          </Text>
        </View>
      </Pressable>
    );
  },
);
CarouselThumb.displayName = 'CarouselThumb';

/**
 * Horizontal image carousel for enriched images in chat messages.
 * Renders thumbnails with fade-in animation and optional Unsplash attribution.
 */
export const ImageCarousel = React.memo(({ images, onImagePress }: ImageCarouselProps) => {
  const { theme } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {images.map((image, index) => (
        <CarouselThumb
          key={image.url}
          image={image}
          index={index}
          onPress={onImagePress}
          placeholderBg={theme.surface}
        />
      ))}
    </ScrollView>
  );
});
ImageCarousel.displayName = 'ImageCarousel';

const styles = StyleSheet.create({
  container: {},
  contentContainer: {
    flexDirection: 'row',
  },
  thumbPressable: {
    marginEnd: semantic.chat.gap,
  },
  thumbContainer: {
    height: THUMB_HEIGHT,
    width: THUMB_WIDTH,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  thumbImage: {
    height: THUMB_HEIGHT,
    width: THUMB_WIDTH,
  },
  attributionOverlay: {
    position: 'absolute',
    bottom: 0,
    start: 0,
    end: 0,
    backgroundColor: ATTRIBUTION_BG,
    paddingHorizontal: space['1'],
    paddingVertical: space['0.5'],
  },
  attributionText: {
    color: ATTRIBUTION_COLOR,
    fontSize: space['2'],
  },
  // C2 v2 (2026-05) — rationale rendered as a 2-line caption under the thumb.
  rationaleContainer: {
    width: THUMB_WIDTH,
    paddingTop: space['1'],
  },
  rationaleText: {
    fontSize: space['2'],
    lineHeight: space['3'],
  },
});
