/* eslint-disable react-hooks/refs -- Animated.Value refs are stable objects read once at creation; safe RN pattern */
import React, { useRef } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { ChatUiEnrichedImage } from '@/features/chat/application/chatSessionLogic.pure';
import { useTheme } from '@/shared/ui/ThemeContext';

const ATTRIBUTION_BG = 'rgba(0,0,0,0.5)';
const ATTRIBUTION_COLOR = '#FFFFFF';

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
    const opacity = useRef(new Animated.Value(0)).current;

    const handleLoad = () => {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    };

    return (
      <Pressable
        onPress={() => {
          onPress(index);
        }}
        accessibilityRole="image"
        accessibilityLabel={image.caption}
        accessibilityHint={t('chat.viewFullscreen')}
        style={styles.thumbPressable}
      >
        <View style={[styles.thumbContainer, { backgroundColor: placeholderBg }]}>
          <Animated.View style={{ opacity }}>
            <Image
              source={{ uri: image.thumbnailUrl }}
              style={styles.thumbImage}
              resizeMode="cover"
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
  container: {
    marginBottom: 8,
  },
  contentContainer: {
    flexDirection: 'row',
  },
  thumbPressable: {
    marginRight: 8,
  },
  thumbContainer: {
    height: THUMB_HEIGHT,
    width: THUMB_WIDTH,
    borderRadius: 8,
    overflow: 'hidden',
  },
  thumbImage: {
    height: THUMB_HEIGHT,
    width: THUMB_WIDTH,
  },
  attributionOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: ATTRIBUTION_BG,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  attributionText: {
    color: ATTRIBUTION_COLOR,
    fontSize: 8,
  },
});
