import type { ReactElement } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { buttonTokens } from '@/shared/ui/tokens';

export interface LiquidButtonProps {
  label: string;
  onPress: () => void | Promise<void>;
  variant?: 'primary' | 'secondary' | 'destructive';
  size?: 'sm' | 'md' | 'lg';
  iconName?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'leading' | 'trailing';
  loading?: boolean;
  disabled?: boolean;
  hapticOnPress?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export function LiquidButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  iconName,
  iconPosition = 'leading',
  loading = false,
  disabled = false,
  hapticOnPress = true,
  testID,
  accessibilityLabel,
  accessibilityHint,
}: LiquidButtonProps): ReactElement {
  const variantTokens = buttonTokens.variants[variant];
  const sizeTokens = buttonTokens.sizes[size];
  const isDisabled = disabled || loading;

  const handlePress = async () => {
    if (isDisabled) return;
    if (hapticOnPress) {
      try {
        await Haptics.selectionAsync();
      } catch {
        // haptics unavailable on simulator / web
      }
    }
    await onPress();
  };

  const containerStyle = [
    styles.base,
    {
      backgroundColor: isDisabled ? variantTokens.bgDisabled : variantTokens.bg,
      borderColor: variantTokens.border,
      borderWidth: variantTokens.border === 'transparent' ? 0 : 1,
      paddingVertical: sizeTokens.paddingV,
      paddingHorizontal: sizeTokens.paddingH,
      borderRadius: sizeTokens.radius,
      opacity: isDisabled ? 0.6 : 1,
    },
  ];

  return (
    <Pressable
      onPress={() => {
        void handlePress();
      }}
      disabled={isDisabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={containerStyle}
    >
      <View style={styles.content}>
        {iconName && iconPosition === 'leading' && !loading ? (
          <Ionicons name={iconName} size={sizeTokens.fontSize + 2} color={variantTokens.text} />
        ) : null}
        {loading ? (
          <ActivityIndicator color={variantTokens.text} size="small" />
        ) : (
          <Text
            style={[styles.label, { color: variantTokens.text, fontSize: sizeTokens.fontSize }]}
          >
            {label}
          </Text>
        )}
        {iconName && iconPosition === 'trailing' && !loading ? (
          <Ionicons name={iconName} size={sizeTokens.fontSize + 2} color={variantTokens.text} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontWeight: '600' },
});
