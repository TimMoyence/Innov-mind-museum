import React, { useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';

import type { ChatUiEnrichedImage } from '@/features/chat/application/chatSessionLogic.pure';
import { fadeIn } from '@/shared/ui/fadeIn';
import { HorizontalStrip } from '@/shared/ui/HorizontalStrip';
import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';
import { useTheme } from '@/shared/ui/ThemeContext';
import { fontSize, lineHeightPx, semantic, space, radius } from '@/shared/ui/tokens';

const ATTRIBUTION_BG = 'rgba(0,0,0,0.5)';
const ATTRIBUTION_COLOR = semantic.fullscreenModal.background;

interface ImageCarouselProps {
  images: ChatUiEnrichedImage[];
  onImagePress: (index: number) => void;
}

const THUMB_HEIGHT = 120;
const THUMB_WIDTH = 120;

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
    const { theme } = useTheme();
    const reduceMotion = useReducedMotion();
    const [opacity] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));

    const handleLoad = () => {
      fadeIn(opacity, reduceMotion, 300);
    };

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
          <Text
            numberOfLines={2}
            ellipsizeMode="tail"
            style={[styles.rationaleText, { color: theme.textSecondary }]}
          >
            {rationaleResolved}
          </Text>
        </View>
      </Pressable>
    );
  },
);
CarouselThumb.displayName = 'CarouselThumb';

export const ImageCarousel = React.memo(({ images, onImagePress }: ImageCarouselProps) => {
  const { theme } = useTheme();

  return (
    <HorizontalStrip contentContainerStyle={styles.contentContainer}>
      {images.map((image, index) => (
        <CarouselThumb
          key={image.url}
          image={image}
          index={index}
          onPress={onImagePress}
          placeholderBg={theme.surface}
        />
      ))}
    </HorizontalStrip>
  );
});
ImageCarousel.displayName = 'ImageCarousel';

const styles = StyleSheet.create({
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
    fontSize: fontSize['xs-'],
  },
  rationaleContainer: {
    width: THUMB_WIDTH,
    paddingTop: space['1'],
  },
  rationaleText: {
    fontSize: fontSize.xs,
    lineHeight: lineHeightPx['18'],
  },
});
