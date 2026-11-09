import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { AccessibilityRole, LayoutChangeEvent, PanResponderInstance } from 'react-native';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useHardwareBack } from '@/shared/ui/hooks/useHardwareBack';
import { useReducedMotion } from '@/shared/ui/hooks/useReducedMotion';
import { useTheme } from '@/shared/ui/ThemeContext';

import { BottomSheetBackdrop } from './BottomSheetBackdrop';
import { dispatchBottomSheetEvent } from './bottomSheetStore';

type Presentation = 'sheet' | 'fullscreen' | 'card';

export type BottomSheetContainerPhase = 'opening' | 'open' | 'closing';

interface BottomSheetContainerProps {
  presentation: Presentation;
  enableSwipeDown: boolean;
  phase: BottomSheetContainerPhase;
  accessibilityLabel?: string;
  onBackdropPress: () => void;
  onHardwareBack: () => void;
  children: React.ReactNode;
}

const SWIPE_DISMISS_FRACTION = 0.5;
const SWIPE_CLAIM_THRESHOLD = 10;

export const BottomSheetContainer = ({
  presentation,
  enableSwipeDown,
  phase,
  accessibilityLabel,
  onBackdropPress,
  onHardwareBack,
  children,
}: BottomSheetContainerProps) => {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const opacity = useMemo(() => new Animated.Value(0), []);
  const translateY = useMemo(() => new Animated.Value(40), []);
  const [sheetHeight, setSheetHeight] = useState(Number.POSITIVE_INFINITY);
  const [openWithoutMotion] = useState(reduceMotion);

  useEffect(() => {
    if (openWithoutMotion) {
      opacity.setValue(1);
      translateY.setValue(0);
      dispatchBottomSheetEvent({ type: 'OPEN_DONE' });
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        dispatchBottomSheetEvent({ type: 'OPEN_DONE' });
      }
    });
  }, [opacity, translateY, openWithoutMotion]);

  useEffect(() => {
    if (phase !== 'closing') return;
    if (reduceMotion) {
      dispatchBottomSheetEvent({ type: 'CLOSE_DONE' });
      return;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 40,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        dispatchBottomSheetEvent({ type: 'CLOSE_DONE' });
      }
    });
  }, [phase, reduceMotion, opacity, translateY]);

  useHardwareBack(onHardwareBack);

  const panResponder = useMemo<PanResponderInstance | null>(() => {
    if (!enableSwipeDown) return null;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gestureState) =>
        gestureState.dy > SWIPE_CLAIM_THRESHOLD &&
        Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_evt, gestureState) => {
        const dy = gestureState.dy > 0 ? gestureState.dy : 0;
        translateY.setValue(dy);
      },
      onPanResponderRelease: (_evt, gestureState) => {
        const threshold = sheetHeight * SWIPE_DISMISS_FRACTION;
        if (gestureState.dy > threshold) {
          onBackdropPress();
          return;
        }
        if (reduceMotion) {
          translateY.setValue(0);
          return;
        }
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        if (reduceMotion) {
          translateY.setValue(0);
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    });
  }, [enableSwipeDown, translateY, sheetHeight, onBackdropPress, reduceMotion]);

  const handleSheetLayout = useMemo(() => {
    if (!enableSwipeDown) return undefined;
    return (event: LayoutChangeEvent) => {
      const { height } = event.nativeEvent.layout;
      if (height > 0) {
        setSheetHeight(height);
      }
    };
  }, [enableSwipeDown]);

  const presentationStyle = useMemo(() => {
    if (presentation === 'fullscreen') {
      return [styles.fullscreen, { backgroundColor: theme.cardBackground }];
    }
    if (presentation === 'card') {
      return [styles.cardWrap];
    }
    return [styles.sheetWrap];
  }, [presentation, theme.cardBackground]);

  const innerStyle = useMemo(() => {
    if (presentation === 'card') {
      return [
        styles.card,
        { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
      ];
    }
    if (presentation === 'sheet') {
      return [
        styles.sheet,
        { backgroundColor: theme.cardBackground, borderColor: theme.cardBorder },
      ];
    }
    return [styles.fullscreenInner];
  }, [presentation, theme.cardBackground, theme.cardBorder]);

  const dialogRole = 'dialog' as AccessibilityRole;

  const panHandlers = panResponder?.panHandlers ?? {};

  const dismissLabel = t('a11y.bottomSheet.dismiss');

  return (
    <View
      accessibilityViewIsModal
      accessibilityRole={dialogRole}
      accessibilityLabel={accessibilityLabel}
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
    >
      <BottomSheetBackdrop
        onPress={onBackdropPress}
        accessibilityLabel={accessibilityLabel}
        dismissLabel={dismissLabel}
      />
      <Animated.View
        style={[
          ...presentationStyle,
          {
            opacity,
            transform: [{ translateY }],
          },
        ]}
        pointerEvents="box-none"
        onLayout={handleSheetLayout}
        {...panHandlers}
      >
        <View style={innerStyle} pointerEvents="auto">
          {children}
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  fullscreen: {
    ...StyleSheet.absoluteFill,
  },
  fullscreenInner: {
    flex: 1,
  },
  cardWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sheetWrap: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
