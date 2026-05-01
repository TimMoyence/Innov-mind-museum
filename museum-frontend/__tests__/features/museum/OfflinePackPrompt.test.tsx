/**
 * OfflinePackPrompt component tests.
 * Standalone mocks (no test-utils import) so we can provide an interpolating
 * i18n stub — the global test-utils mock would override a local jest.mock call
 * because its side-effects run after babel-hoisted local mocks.
 */

// ── react-i18next: stub that appends interpolation values so tests can assert
//    on dynamic values (e.g. cityName) without loading real translation files.
jest.mock('react-i18next', () => {
  const { Text } = require('react-native');
  return {
    useTranslation: () => ({
      t: (key: string, opts?: Record<string, unknown>) => {
        if (!opts || Object.keys(opts).length === 0) return key;
        // Append interpolated values so assertions like getByText(/Paris/) pass
        const values = Object.values(opts)
          .filter((v) => typeof v === 'string' || typeof v === 'number')
          .join(' ');
        return `${key} ${values}`.trim();
      },
      i18n: { language: 'en' },
    }),
    Trans: ({ i18nKey }: { i18nKey: string }) => <Text>{i18nKey}</Text>,
  };
});

// ── ThemeContext ──────────────────────────────────────────────────────────────
jest.mock('@/shared/ui/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      textPrimary: '#0F172A',
      textSecondary: '#334155',
      textTertiary: '#475569',
      cardBorder: 'rgba(148,163,184,0.42)',
      surface: 'rgba(255,255,255,0.64)',
    },
    mode: 'light',
    isDark: false,
    setMode: jest.fn(),
  }),
}));

// ── Ionicons ──────────────────────────────────────────────────────────────────
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, ...props }: { name: string; [key: string]: unknown }) => (
      <Text {...props}>{name}</Text>
    ),
  };
});

// ── expo-haptics ──────────────────────────────────────────────────────────────
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// ── shared/ui/tokens (used by LiquidButton) ───────────────────────────────────
jest.mock('@/shared/ui/tokens', () => ({
  buttonTokens: {
    variants: {
      primary: { bg: '#1D4ED8', text: '#FFFFFF', border: 'transparent' },
      secondary: { bg: 'transparent', text: '#1D4ED8', border: '#1D4ED8' },
      destructive: { bg: '#DC2626', text: '#FFFFFF', border: 'transparent' },
    },
    sizes: {
      sm: { height: 36, px: 12, fontSize: 13 },
      md: { height: 44, px: 16, fontSize: 15 },
      lg: { height: 52, px: 20, fontSize: 17 },
    },
  },
}));

import { render, fireEvent, screen } from '@testing-library/react-native';
import { OfflinePackPrompt } from '@/features/museum/ui/OfflinePackPrompt';

describe('OfflinePackPrompt', () => {
  it('renders title and description with localized cityName', () => {
    render(
      <OfflinePackPrompt
        visible
        cityId="paris"
        cityName="Paris"
        onAccept={jest.fn()}
        onDecline={jest.fn()}
        testID="opp"
      />,
    );
    expect(screen.getByText(/Paris/)).toBeTruthy();
  });

  it('fires onAccept when accept button pressed', async () => {
    const onAccept = jest.fn();
    render(
      <OfflinePackPrompt
        visible
        cityId="paris"
        cityName="Paris"
        onAccept={onAccept}
        onDecline={jest.fn()}
        testID="opp"
      />,
    );
    fireEvent.press(screen.getByTestId('opp-accept'));
    await new Promise((r) => setTimeout(r, 0));
    expect(onAccept).toHaveBeenCalled();
  });

  it('fires onDecline when decline button pressed', async () => {
    const onDecline = jest.fn();
    render(
      <OfflinePackPrompt
        visible
        cityId="paris"
        cityName="Paris"
        onAccept={jest.fn()}
        onDecline={onDecline}
        testID="opp"
      />,
    );
    fireEvent.press(screen.getByTestId('opp-decline'));
    await new Promise((r) => setTimeout(r, 0));
    expect(onDecline).toHaveBeenCalled();
  });

  it('does not render content when visible=false', () => {
    render(
      <OfflinePackPrompt
        visible={false}
        cityId="paris"
        cityName="Paris"
        onAccept={jest.fn()}
        onDecline={jest.fn()}
        testID="opp"
      />,
    );
    // Modal hides content; query for accept testID returns null
    expect(screen.queryByTestId('opp-accept')).toBeNull();
  });
});
