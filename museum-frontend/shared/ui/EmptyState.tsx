import type { ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LiquidButton } from '@/shared/ui/LiquidButton';
import { emptyStateTokens } from '@/shared/ui/tokens';

export type EmptyStateVariant = 'chat' | 'museums' | 'reviews' | 'dailyArt' | 'conversations';

export interface EmptyStateProps {
  variant: EmptyStateVariant;
  title: string;
  description?: string;
  primaryAction?: {
    label: string;
    onPress: () => void | Promise<void>;
    iconName?: keyof typeof Ionicons.glyphMap;
  };
  testID?: string;
}

export function EmptyState({
  variant,
  title,
  description,
  primaryAction,
  testID,
}: EmptyStateProps): ReactElement {
  const v = emptyStateTokens.variants[variant];
  const layout = emptyStateTokens.layout;

  return (
    <View
      style={[styles.container, { padding: layout.padding, gap: layout.gap }]}
      testID={testID}
      accessibilityRole="summary"
    >
      <View
        style={[
          styles.iconBackplate,
          {
            backgroundColor: v.iconBg,
            width: layout.iconSize,
            height: layout.iconSize,
            borderRadius: layout.iconSize / 2,
          },
        ]}
      >
        <Ionicons
          name={v.iconName as keyof typeof Ionicons.glyphMap}
          size={layout.iconSize * 0.5}
          color={v.iconColor}
        />
      </View>
      <Text style={[styles.title, { fontSize: layout.titleSize }]} accessibilityRole="header">
        {title}
      </Text>
      {description !== undefined ? (
        <Text style={[styles.description, { fontSize: layout.descriptionSize }]}>
          {description}
        </Text>
      ) : null}
      {primaryAction !== undefined ? (
        <LiquidButton
          variant="primary"
          size="md"
          label={primaryAction.label}
          onPress={primaryAction.onPress}
          iconName={primaryAction.iconName}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  iconBackplate: { alignItems: 'center', justifyContent: 'center' },
  title: { fontWeight: '600', textAlign: 'center' },
  description: { textAlign: 'center', opacity: 0.7 },
});
