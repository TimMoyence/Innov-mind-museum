import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { LiquidButton } from '@/shared/ui/LiquidButton';
import { useTheme } from '@/shared/ui/ThemeContext';
import { fontSize, lineHeightPx, radius, semantic, space } from '@/shared/ui/tokens';

interface BiometricSetupSheetProps {
  /** Whether the sheet is visible. */
  visible: boolean;
  /** Human-readable label for the biometric method (e.g. "Face ID", "Touch ID"). */
  biometricLabel: string;
  /** Called when the user activates biometric login. May resolve even on auth cancel. */
  onActivate: () => Promise<void>;
  /** Called when the user dismisses the sheet without enrolling. */
  onSkip: () => void;
}

const ANIMATION_DURATION_MS = 220;
const SHEET_HIDDEN_OFFSET = 600;

const pickIconName = (biometricLabel: string): keyof typeof Ionicons.glyphMap => {
  if (biometricLabel.toLowerCase().includes('face')) {
    return 'scan-outline';
  }
  return 'finger-print';
};

/**
 * Bottom-sheet modal offered after first successful login to invite the
 * user to enroll biometric authentication. Skip-able, never blocking.
 */
export function BiometricSetupSheet({
  visible,
  biometricLabel,
  onActivate,
  onSkip,
}: BiometricSetupSheetProps) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SHEET_HIDDEN_OFFSET)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [isActivating, setIsActivating] = useState(false);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: ANIMATION_DURATION_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: ANIMATION_DURATION_MS,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      translateY.setValue(SHEET_HIDDEN_OFFSET);
      opacity.setValue(0);
    }
  }, [visible, translateY, opacity]);

  const handleActivate = async (): Promise<void> => {
    if (isActivating) return;
    setIsActivating(true);
    try {
      await onActivate();
    } finally {
      setIsActivating(false);
    }
  };

  const titleText = t('auth.biometric_setup.title', {
    defaultValue: `Activer ${biometricLabel} ?`,
    method: biometricLabel,
  });
  const descriptionText = t('auth.biometric_setup.description', {
    defaultValue: 'Connectez-vous plus rapidement la prochaine fois.',
  });
  const activateText = t('auth.biometric_setup.activate', {
    defaultValue: 'Activer',
  });
  const laterText = t('auth.biometric_setup.later', {
    defaultValue: 'Plus tard',
  });

  const sheetStyle: StyleProp<ViewStyle> = [
    styles.sheet,
    {
      backgroundColor: theme.surface,
      borderColor: theme.cardBorder,
      paddingBottom: Math.max(insets.bottom, space['4']) + space['4'],
      transform: [{ translateY }],
    },
  ];

  const iconName = pickIconName(biometricLabel);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onSkip}
      statusBarTranslucent
    >
      <Animated.View
        style={[styles.backdrop, { backgroundColor: theme.modalOverlay, opacity }]}
        pointerEvents={visible ? 'auto' : 'none'}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onSkip}
          accessibilityLabel={laterText}
          accessibilityRole="button"
        />
        <Animated.View style={sheetStyle}>
          <View style={[styles.iconBubble, { backgroundColor: theme.primaryTint }]}>
            <Ionicons name={iconName} size={32} color={theme.primary} />
          </View>
          <Text style={[styles.title, { color: theme.textPrimary }]}>{titleText}</Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>
            {descriptionText}
          </Text>

          <LiquidButton
            label={activateText}
            onPress={handleActivate}
            loading={isActivating}
            disabled={isActivating}
            accessibilityLabel={activateText}
            variant="primary"
            size="md"
          />

          <LiquidButton
            label={laterText}
            onPress={onSkip}
            accessibilityLabel={laterText}
            variant="secondary"
            size="md"
          />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    paddingHorizontal: semantic.card.paddingLarge,
    paddingTop: semantic.card.paddingLarge,
    borderTopLeftRadius: radius['3xl'],
    borderTopRightRadius: radius['3xl'],
    borderTopWidth: semantic.input.borderWidth,
    borderLeftWidth: semantic.input.borderWidth,
    borderRightWidth: semantic.input.borderWidth,
    alignItems: 'center',
    gap: space['3'],
  },
  iconBubble: {
    width: 64,
    height: 64,
    borderRadius: radius['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    fontSize: fontSize.sm,
    lineHeight: lineHeightPx['21'],
    textAlign: 'center',
  },
});
