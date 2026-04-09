/* eslint-disable react-hooks/refs -- Animated.Value + PanResponder refs are stable objects read once at creation; safe RN pattern */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import type { ChatUiEnrichedImage } from '@/features/chat/application/chatSessionLogic.pure';
import { semantic } from '@/shared/ui/tokens.semantic';
import { space, fontSize } from '@/shared/ui/tokens.generated';

interface ImageFullscreenModalProps {
  images: ChatUiEnrichedImage[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
}

const SWIPE_THRESHOLD = 150;
const MODAL_BG = 'rgba(0,0,0,0.95)';
const CAPTION_COLOR = semantic.fullscreenModal.background;
const ATTRIBUTION_COLOR = semantic.fullscreenModal.captionColor;
const COUNTER_COLOR = semantic.fullscreenModal.counterColor;

/**
 * Fullscreen modal for viewing enriched images with swipe navigation.
 * Supports horizontal swipe for prev/next and vertical swipe-down to dismiss.
 */
export const ImageFullscreenModal = React.memo(
  ({ images, initialIndex, visible, onClose }: ImageFullscreenModalProps) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const { width: screenWidth } = useWindowDimensions();
    const translateX = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(0)).current;
    const scale = useRef(new Animated.Value(1)).current;

    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const imagesRef = useRef(images);
    imagesRef.current = images;

    // Reset index when modal opens with a new initialIndex
    useEffect(() => {
      if (visible) {
        setCurrentIndex(initialIndex);
        translateX.setValue(0);
        translateY.setValue(0);
        scale.setValue(1);
      }
    }, [visible, initialIndex, translateX, translateY, scale]);

    const goTo = (nextIndex: number) => {
      Animated.timing(scale, {
        toValue: 0.9,
        duration: 100,
        useNativeDriver: true,
      }).start(() => {
        setCurrentIndex(nextIndex);
        Animated.timing(scale, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }).start();
      });
    };

    const panResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_evt, gestureState) =>
          Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10,
        onPanResponderMove: (_evt, gestureState) => {
          if (Math.abs(gestureState.dy) > Math.abs(gestureState.dx)) {
            // Vertical movement — track for dismiss
            translateY.setValue(gestureState.dy);
          } else {
            // Horizontal movement — track for navigation
            translateX.setValue(gestureState.dx);
          }
        },
        onPanResponderRelease: (_evt, gestureState) => {
          // Swipe down to dismiss
          if (gestureState.dy > SWIPE_THRESHOLD) {
            onCloseRef.current();
            translateY.setValue(0);
            translateX.setValue(0);
            return;
          }

          // Horizontal swipe for navigation
          if (gestureState.dx < -SWIPE_THRESHOLD) {
            // Swipe left → next
            setCurrentIndex((prev) => (prev < imagesRef.current.length - 1 ? prev + 1 : prev));
          } else if (gestureState.dx > SWIPE_THRESHOLD) {
            // Swipe right → prev
            setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
          }

          // Reset transforms
          Animated.parallel([
            Animated.timing(translateX, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(translateY, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start();
        },
      }),
    ).current;

    const current = images[currentIndex];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive runtime bounds check
    if (!current) return null;

    return (
      <Modal
        animationType="fade"
        transparent
        statusBarTranslucent
        visible={visible}
        onRequestClose={onClose}
      >
        <SafeAreaView style={styles.root}>
          {/* Close button */}
          <Pressable
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={12}
          >
            <Ionicons name="close-circle" size={32} color={CAPTION_COLOR} />
          </Pressable>

          {/* Image area */}
          <Animated.View
            style={[
              styles.imageArea,
              {
                transform: [{ translateX }, { translateY }, { scale }],
              },
            ]}
            {...panResponder.panHandlers}
          >
            {/* Tap zones for navigation */}
            <View style={styles.tapZoneContainer}>
              <Pressable
                style={styles.tapZoneLeft}
                onPress={() => {
                  if (currentIndex > 0) goTo(currentIndex - 1);
                }}
                accessibilityLabel="Previous image"
              />
              <Pressable
                style={styles.tapZoneRight}
                onPress={() => {
                  if (currentIndex < images.length - 1) goTo(currentIndex + 1);
                }}
                accessibilityLabel="Next image"
              />
            </View>

            <Image
              source={{ uri: current.url }}
              style={[styles.fullImage, { width: screenWidth }]}
              resizeMode="contain"
              accessibilityLabel={current.caption}
            />
          </Animated.View>

          {/* Bottom bar */}
          <View style={styles.bottomBar}>
            <Text style={styles.caption} numberOfLines={2}>
              {current.caption}
            </Text>
            {current.attribution ? (
              <Text style={styles.attribution} numberOfLines={1}>
                {current.attribution}
              </Text>
            ) : null}
            <Text style={styles.counter}>
              {`${String(currentIndex + 1)} / ${String(images.length)}`}
            </Text>
          </View>
        </SafeAreaView>
      </Modal>
    );
  },
);
ImageFullscreenModal.displayName = 'ImageFullscreenModal';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: MODAL_BG,
  },
  closeButton: {
    position: 'absolute',
    top: space['12.5'],
    right: semantic.screen.padding,
    zIndex: 10,
  },
  imageArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tapZoneContainer: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    zIndex: 5,
  },
  tapZoneLeft: {
    width: '30%',
    height: '100%',
  },
  tapZoneRight: {
    position: 'absolute',
    right: 0,
    width: '30%',
    height: '100%',
  },
  fullImage: {
    height: '80%',
  },
  bottomBar: {
    paddingHorizontal: semantic.screen.padding,
    paddingBottom: semantic.screen.paddingLarge,
    paddingTop: semantic.card.gap,
  },
  caption: {
    color: CAPTION_COLOR,
    fontSize: fontSize.sm,
    marginBottom: semantic.card.gapTiny,
  },
  attribution: {
    color: ATTRIBUTION_COLOR,
    fontSize: fontSize.xs,
    marginBottom: semantic.card.gapTiny,
  },
  counter: {
    color: COUNTER_COLOR,
    fontSize: fontSize.xs,
  },
});
