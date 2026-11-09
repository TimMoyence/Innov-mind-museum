import React, { useMemo } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { useHardwareBack } from '@/shared/ui/hooks/useHardwareBack';
import { fontSize, space } from '@/shared/ui/tokens';

import type { ArtworkHeroModel } from '@/features/chat/application/useArtworkHero';
import { useCarnetImageSource } from '@/features/chat/application/useCarnetImageSource';
import { artworkLocation } from '@/features/chat/ui/ArtworkCard';

interface ArtworkHeroModalProps {
  readonly visible: boolean;
  readonly model: ArtworkHeroModel | null;
  readonly onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;

const MODAL_BG = 'rgba(0,0,0,0.95)';
const TITLE_COLOR = '#ffffff';
const SUBTITLE_COLOR = '#e5e7eb';
const LOCATION_COLOR = '#cbd5e1';
const CLOSE_ICON_COLOR = '#ffffff';

export const ArtworkHeroModal = React.memo(function ArtworkHeroModal({
  visible,
  model,
  onClose,
}: ArtworkHeroModalProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  useHardwareBack(onClose, visible);

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onUpdate((e) => {
          'worklet';
          const next = savedScale.value * e.scale;
          scale.value = next < MIN_SCALE ? MIN_SCALE : next > MAX_SCALE ? MAX_SCALE : next;
        })
        .onEnd(() => {
          'worklet';
          savedScale.value = scale.value;
        }),
    [savedScale, scale],
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  if (!visible || !model) return null;

  const title = model.title ?? t('chat.artworkHero.modal.title_fallback');
  const location = artworkLocation(model.museum, model.room);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaView style={styles.root} accessibilityViewIsModal>
          <Pressable
            style={[styles.closeButton, { top: insets.top + space['4'] }]}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('chat.artworkHero.modal.close')}
            hitSlop={12}
            testID="artwork-hero-modal-close"
          >
            <Ionicons name="close-circle" size={32} color={CLOSE_ICON_COLOR} />
          </Pressable>

          <GestureDetector gesture={pinch}>
            <Animated.View
              style={[styles.imageArea, animatedStyle]}
              accessibilityHint={t('chat.artworkHero.modal.a11y_pinch_hint')}
            >
              <FullImage messageId={model.messageId} fallbackUrl={model.imageUrl} />
            </Animated.View>
          </GestureDetector>

          <View style={styles.bottomBar}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            {model.artist ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {model.artist}
              </Text>
            ) : null}
            {location ? (
              <Text style={styles.location} numberOfLines={1}>
                {location}
              </Text>
            ) : null}
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
});

interface FullImageProps {
  readonly messageId: string | null;
  readonly fallbackUrl: string;
}

function FullImage({ messageId, fallbackUrl }: FullImageProps): React.ReactElement {
  const { uri } = useCarnetImageSource({ messageId: messageId ?? '', fallbackUrl });
  return (
    <Image
      source={{ uri }}
      style={styles.fullImage}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
      testID="artwork-hero-modal-image"
    />
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: MODAL_BG,
  },
  closeButton: {
    position: 'absolute',
    end: space['4'],
    zIndex: 10,
  },
  imageArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullImage: {
    width: '100%',
    height: '100%',
  },
  bottomBar: {
    paddingHorizontal: space['4'],
    paddingVertical: space['3'],
  },
  title: {
    color: TITLE_COLOR,
    fontSize: fontSize.lg,
    fontWeight: '700',
  },
  subtitle: {
    color: SUBTITLE_COLOR,
    fontSize: fontSize.sm,
    marginTop: space['1'],
  },
  location: {
    color: LOCATION_COLOR,
    fontSize: fontSize.xs,
    marginTop: space['0.5'],
  },
});
