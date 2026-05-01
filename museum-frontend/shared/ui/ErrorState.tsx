import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LiquidButton } from '@/shared/ui/LiquidButton';
import { errorStateTokens } from '@/shared/ui/tokens';

export type ErrorStateVariant = 'inline' | 'fullscreen';

export interface ErrorStateProps {
  title: string;
  description?: string;
  onRetry?: () => void | Promise<void>;
  onDismiss?: () => void;
  retryLabel?: string;
  variant?: ErrorStateVariant;
  testID?: string;
}

export function ErrorState({
  title,
  description,
  onRetry,
  onDismiss,
  retryLabel,
  variant = 'inline',
  testID,
}: ErrorStateProps): ReactElement {
  const padding =
    variant === 'fullscreen'
      ? errorStateTokens.layout.fullscreenPadding
      : errorStateTokens.layout.padding;
  const containerStyle = [
    styles.container,
    {
      padding,
      gap: errorStateTokens.layout.gap,
      borderRadius: variant === 'inline' ? errorStateTokens.layout.inlineRadius : 0,
      backgroundColor: variant === 'inline' ? errorStateTokens.iconBg : 'transparent',
      flex: variant === 'fullscreen' ? 1 : 0,
    },
  ];

  return (
    <View
      style={containerStyle}
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={styles.iconRow}>
        <Ionicons
          name={errorStateTokens.iconName as keyof typeof Ionicons.glyphMap}
          size={variant === 'fullscreen' ? 48 : 24}
          color={errorStateTokens.iconColor}
        />
        <Text
          style={[styles.title, { color: errorStateTokens.titleColor }]}
          accessibilityRole="header"
        >
          {title}
        </Text>
      </View>
      {description !== undefined && (
        <Text style={[styles.description, { color: errorStateTokens.descriptionColor }]}>
          {description}
        </Text>
      )}
      {(onRetry !== undefined || onDismiss !== undefined) && (
        <View style={styles.actions}>
          {onRetry !== undefined && (
            <LiquidButton
              variant="primary"
              size="sm"
              label={retryLabel ?? 'Retry'}
              onPress={onRetry}
              iconName="refresh-outline"
              testID={testID !== undefined ? `${testID}-retry` : undefined}
            />
          )}
          {onDismiss !== undefined && (
            <LiquidButton
              variant="secondary"
              size="sm"
              label="Dismiss"
              onPress={onDismiss}
              iconName="close-outline"
              hapticOnPress={false}
              testID={testID !== undefined ? `${testID}-dismiss` : undefined}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'flex-start' },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontWeight: '600', flexShrink: 1 },
  description: { fontSize: 14 },
  actions: { flexDirection: 'row', gap: 8, alignSelf: 'stretch' },
});
