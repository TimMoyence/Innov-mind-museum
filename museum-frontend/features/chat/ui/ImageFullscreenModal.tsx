import React, { useEffect, useMemo, useState } from 'react';
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
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import type { ChatUiEnrichedImage } from '@/features/chat/application/chatSessionLogic.pure';
import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';
import { semantic, space, fontSize } from '@/shared/ui/tokens';

export type FullscreenImage = Pick<ChatUiEnrichedImage, 'url' | 'caption' | 'attribution'>;

interface ImageFullscreenModalProps {
  images: readonly FullscreenImage[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
}

const SWIPE_THRESHOLD = 150;
const MODAL_BG = 'rgba(0,0,0,0.95)';
const CAPTION_COLOR = semantic.fullscreenModal.background;
const ATTRIBUTION_COLOR = semantic.fullscreenModal.captionColor;
const COUNTER_COLOR = semantic.fullscreenModal.counterColor;

export const ImageFullscreenModal = React.memo(
  ({ images, initialIndex, visible, onClose }: ImageFullscreenModalProps) => {
    const { t } = useTranslation();
    const insets = useSafeAreaInsets();
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const reduceMotion = useReducedMotion();
    const { width: screenWidth } = useWindowDimensions();
    const [translateX] = useState(() => new Animated.Value(0));
    const [translateY] = useState(() => new Animated.Value(0));
    const [scale] = useState(() => new Animated.Value(1));

    const imageCount = images.length;
    const [openedWith, setOpenedWith] = useState({ visible, initialIndex });
    if (openedWith.visible !== visible || openedWith.initialIndex !== initialIndex) {
      setOpenedWith({ visible, initialIndex });
      if (visible) setCurrentIndex(initialIndex);
    }

    useEffect(() => {
      if (visible) {
        translateX.setValue(0);
        translateY.setValue(0);
        scale.setValue(1);
      }
    }, [visible, initialIndex, translateX, translateY, scale]);

    const goTo = (nextIndex: number) => {
      if (reduceMotion) {
        setCurrentIndex(nextIndex);
        return;
      }
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

    const panResponder = useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: (_evt, gestureState) =>
            Math.abs(gestureState.dx) > 10 || Math.abs(gestureState.dy) > 10,
          onPanResponderMove: (_evt, gestureState) => {
            if (Math.abs(gestureState.dy) > Math.abs(gestureState.dx)) {
              translateY.setValue(gestureState.dy);
            } else {
              translateX.setValue(gestureState.dx);
            }
          },
          onPanResponderRelease: (_evt, gestureState) => {
            if (gestureState.dy > SWIPE_THRESHOLD) {
              onClose();
              translateY.setValue(0);
              translateX.setValue(0);
              return;
            }

            if (gestureState.dx < -SWIPE_THRESHOLD) {
              setCurrentIndex((prev) => (prev < imageCount - 1 ? prev + 1 : prev));
            } else if (gestureState.dx > SWIPE_THRESHOLD) {
              setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
            }

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
      [onClose, imageCount, translateX, translateY],
    );

    const current = images[currentIndex];
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
          <Pressable
            style={[styles.closeButton, { top: insets.top + space['4'] }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.chat.fullscreen_close')}
            hitSlop={12}
            testID="image-fullscreen-modal-close"
          >
            <Ionicons name="close-circle" size={32} color={CAPTION_COLOR} />
          </Pressable>

          <Animated.View
            style={[
              styles.imageArea,
              {
                transform: [{ translateX }, { translateY }, { scale }],
              },
            ]}
            {...panResponder.panHandlers}
          >
            <View style={styles.tapZoneContainer}>
              <Pressable
                style={styles.tapZoneLeft}
                onPress={() => {
                  if (currentIndex > 0) goTo(currentIndex - 1);
                }}
                accessibilityLabel={t('a11y.chat.previous_image')}
                testID="image-fullscreen-modal-prev"
              />
              <Pressable
                style={styles.tapZoneRight}
                onPress={() => {
                  if (currentIndex < images.length - 1) goTo(currentIndex + 1);
                }}
                accessibilityLabel={t('a11y.chat.next_image')}
                testID="image-fullscreen-modal-next"
              />
            </View>

            <Image
              source={{ uri: current.url }}
              style={[styles.fullImage, { width: screenWidth }]}
              resizeMode="contain"
              accessibilityLabel={current.caption}
            />
          </Animated.View>

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
    end: semantic.screen.padding,
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
    end: 0,
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
