/**
 * A2 — Artwork hero modal (fullscreen + pinch-zoom).
 *
 * Opened on tap of `<ArtworkHeroCard>`. Renders the user-uploaded image at
 * full size with pinch-to-zoom (gesture-handler v2 + Reanimated worklet)
 * + metadata footer + close button.
 *
 * Pinch-zoom : `Gesture.Pinch()` (v2 API) + `useSharedValue` clamped to
 * `[1, 5]` via `useAnimatedStyle`. The gesture stays active in reduced-motion
 * mode — pinch is a functional gesture, not decorative motion (see
 * `useReducedMotion.ts:11` comment).
 *
 * Hardware-back : Android `BackHandler` listener invokes `onClose()` while
 * the modal is visible (pattern reused from `MuseumSheet.tsx:42`).
 *
 * Lazy mount : returns `null` when `!visible || !model` so the GestureDetector
 * + Reanimated worklets do not initialise unless the modal is actually shown.
 * This keeps screens that never open the modal (e.g. chat-session-deep test
 * suite) free of gesture-handler / reanimated test friction.
 *
 * Spec: docs/chat-ux-refonte/specs/A2.md §1.3 (R16-R22).
 */

import React, { useEffect } from 'react';
import { BackHandler, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { fontSize, space } from '@/shared/ui/tokens';

import type { ArtworkHeroModel } from '@/features/chat/application/useArtworkHero';

interface ArtworkHeroModalProps {
  readonly visible: boolean;
  readonly model: ArtworkHeroModel | null;
  readonly onClose: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;

// Modal overlay palette — local constants cohérentes avec
// `ImageFullscreenModal.tsx:30-33`. Non-thematique (toujours overlay sombre
// fullscreen) ; donc pas extraitable comme token DS sans casser le DS.
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
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  // R19 — Android hardware-back closes the modal without quitting the screen.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => {
      sub.remove();
    };
  }, [visible, onClose]);

  // R20 — pinch-zoom clamped to [1, 5]. Worklet-driven via Reanimated.
  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      'worklet';
      const next = savedScale.value * e.scale;
      scale.value = next < MIN_SCALE ? MIN_SCALE : next > MAX_SCALE ? MAX_SCALE : next;
    })
    .onEnd(() => {
      'worklet';
      savedScale.value = scale.value;
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  // R16 — lazy mount : skip the gesture tree entirely when not visible.
  if (!visible || !model) return null;

  const title = model.title ?? t('chat.artworkHero.modal.title_fallback');
  const location = model.museum ? [model.museum, model.room].filter(Boolean).join(' — ') : null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.root} accessibilityViewIsModal>
        <Pressable
          style={styles.closeButton}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('chat.artworkHero.modal.close')}
          hitSlop={12}
        >
          <Ionicons name="close-circle" size={32} color={CLOSE_ICON_COLOR} />
        </Pressable>

        <GestureDetector gesture={pinch}>
          <Animated.View
            style={[styles.imageArea, animatedStyle]}
            accessibilityHint={t('chat.artworkHero.modal.a11y_pinch_hint')}
          >
            <Image
              source={{ uri: model.imageUrl }}
              style={styles.fullImage}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
              testID="artwork-hero-modal-image"
            />
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
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: MODAL_BG,
  },
  closeButton: {
    position: 'absolute',
    top: space['4'],
    right: space['4'],
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
