/**
 * Shared mocks and render utilities for component tests.
 *
 * Import this file at the top of every component test to get common
 * module mocks (i18n, theme, router, safe-area, icons, etc.) applied
 * automatically via jest.mock() hoisting.
 */

import type React from 'react';

// ── react-i18next ────────────────────────────────────────────────────────────
jest.mock('react-i18next', () => {
  const { Text } = require('react-native');
  return {
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
    Trans: ({ i18nKey }: { i18nKey: string }) => <Text>{i18nKey}</Text>,
  };
});

// ── Theme — light theme values from shared/ui/themes.ts ─────────────────────
jest.mock('@/shared/ui/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      pageGradient: ['#EAF2FF', '#D8E8FF', '#D5F0FF'] as readonly [string, string, ...string[]],
      primary: '#1D4ED8',
      primaryContrast: '#FFFFFF',
      textPrimary: '#0F172A',
      textSecondary: '#334155',
      textTertiary: '#475569',
      placeholderText: '#64748B',
      glassBorder: 'rgba(255,255,255,0.58)',
      glassBackground: 'rgba(255,255,255,0.44)',
      cardBackground: 'rgba(255,255,255,0.66)',
      cardBorder: 'rgba(148,163,184,0.42)',
      inputBackground: 'rgba(255,255,255,0.7)',
      inputBorder: 'rgba(148,163,184,0.45)',
      userBubble: 'rgba(30, 64, 175, 0.88)',
      userBubbleBorder: 'rgba(191, 219, 254, 0.6)',
      assistantBubble: 'rgba(255,255,255,0.72)',
      assistantBubbleBorder: 'rgba(148,163,184,0.22)',
      error: '#991B1B',
      errorBackground: 'rgba(254,242,242,0.82)',
      success: '#166534',
      successBackground: 'rgba(220,252,231,0.78)',
      danger: '#DC2626',
      warningText: '#92400E',
      warningBackground: 'rgba(254,243,199,0.78)',
      shadowColor: '#1E3A8A',
      primaryTint: 'rgba(30, 64, 175, 0.06)',
      primaryBorderSubtle: 'rgba(30, 64, 175, 0.2)',
      modalOverlay: 'rgba(0, 0, 0, 0.4)',
      separator: 'rgba(148, 163, 184, 0.35)',
      timestamp: 'rgba(100,116,139,0.92)',
      surface: 'rgba(255,255,255,0.64)',
      overlay: 'rgba(255,255,255,0.70)',
      blurTint: 'light' as const,
    },
    mode: 'light' as const,
    isDark: false,
    setMode: jest.fn(),
  }),
}));

// ── expo-router ──────────────────────────────────────────────────────────────
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
}));

// ── safe-area ────────────────────────────────────────────────────────────────
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: View,
  };
});

// ── @react-navigation/bottom-tabs ────────────────────────────────────────────
// Tab screens call useBottomTabBarHeight() at render time. Outside a tab
// navigator the real hook throws — mock returns 0 (the resolved layout value
// tests should assume; they do not assert on the padding itself).
jest.mock('@react-navigation/bottom-tabs', () => ({
  useBottomTabBarHeight: () => 0,
}));

// ── Ionicons — render icon name as text ──────────────────────────────────────
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, ...props }: { name: string; [key: string]: unknown }) => (
      <Text {...props}>{name}</Text>
    ),
  };
});

// ── expo-blur ────────────────────────────────────────────────────────────────
jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return {
    BlurView: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
      <View {...props}>{children}</View>
    ),
  };
});

// ── expo-haptics ─────────────────────────────────────────────────────────────
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// ── expo-linear-gradient ─────────────────────────────────────────────────────
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return {
    LinearGradient: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
      [key: string]: unknown;
    }) => <View {...props}>{children}</View>,
  };
});

// ── @sentry/react-native ─────────────────────────────────────────────────────
jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  wrap: (component: unknown) => component,
}));

// ── expo-updates ─────────────────────────────────────────────────────────────
jest.mock('expo-updates', () => ({
  reloadAsync: jest.fn(),
}));

// ── GlassCard — simple passthrough ───────────────────────────────────────────
jest.mock('@/shared/ui/GlassCard', () => {
  const { View } = require('react-native');
  return {
    GlassCard: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) => (
      <View {...props}>{children}</View>
    ),
  };
});

// ── LiquidScreen — simple passthrough ────────────────────────────────────────
jest.mock('@/shared/ui/LiquidScreen', () => {
  const { View } = require('react-native');
  return {
    LiquidScreen: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

// ── liquidTheme ──────────────────────────────────────────────────────────────
jest.mock('@/shared/ui/liquidTheme', () => ({
  pickMuseumBackground: () => 0,
}));

// ── BrandMark ────────────────────────────────────────────────────────────────
jest.mock('@/shared/ui/BrandMark', () => {
  const { View } = require('react-native');
  return {
    BrandMark: () => <View testID="brand-mark" />,
  };
});

// ── FloatingContextMenu ──────────────────────────────────────────────────────
jest.mock('@/shared/ui/FloatingContextMenu', () => {
  const { View } = require('react-native');
  return {
    FloatingContextMenu: () => <View testID="floating-context-menu" />,
  };
});

// ── SkeletonConversationCard ─────────────────────────────────────────────────
jest.mock('@/shared/ui/SkeletonConversationCard', () => {
  const { View } = require('react-native');
  return {
    SkeletonConversationCard: () => <View testID="skeleton-card" />,
  };
});

// ── ErrorState ───────────────────────────────────────────────────────────────
jest.mock('@/shared/ui/ErrorState', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    ErrorState: ({
      title,
      onRetry,
      onDismiss,
      testID,
    }: {
      title: string;
      onRetry?: () => void;
      onDismiss?: () => void;
      testID?: string;
    }) => (
      <View testID={testID ?? 'error-state'}>
        <Text>{title}</Text>
        {onRetry ? (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="errorNotice.retry"
            testID={testID !== undefined ? `${testID}-retry` : 'error-state-retry'}
          >
            <Text>errorNotice.retry</Text>
          </Pressable>
        ) : null}
        {onDismiss ? (
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="errorNotice.dismiss"
            testID={testID !== undefined ? `${testID}-dismiss` : 'error-state-dismiss'}
          >
            <Text>errorNotice.dismiss</Text>
          </Pressable>
        ) : null}
      </View>
    ),
  };
});

// ── @/shared/lib/errors ─────────────────────────────────────────────────────
// Mirrors the production getErrorMessage() contract in a minimal way:
// an AppError's .message (carried by the Error instance) is returned.
// The real hook walks the i18n table; tests assert on the raw message,
// so returning `err.message` keeps tests aligned with production semantics.
jest.mock('@/shared/lib/errors', () => ({
  getErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : typeof err === 'string' ? err : String(err),
  isAppError: (err: unknown): boolean =>
    !!err && typeof err === 'object' && 'kind' in err && 'message' in err,
  isDailyLimitError: (err: unknown): boolean =>
    !!err &&
    typeof err === 'object' &&
    'kind' in err &&
    (err as { kind: unknown }).kind === 'DailyLimitReached',
}));

// ── FlashList → FlatList (native RecyclerView not available in tests) ────────
jest.mock('@shopify/flash-list', () => {
  const { FlatList } = require('react-native');
  return {
    FlashList: FlatList,
  };
});
