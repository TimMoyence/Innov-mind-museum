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
      primary: '#1D4ED8',
      primaryContrast: '#FFFFFF',
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
import type { CityPackState } from '@/features/museum/application/useOfflinePacks';
import { OfflinePackPrompt } from '@/features/museum/ui/OfflinePackPrompt';

const ABSENT: CityPackState = { status: 'absent' };

interface RenderOpts {
  visible?: boolean;
  packState?: CityPackState;
  errorVisible?: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
}

const renderPrompt = (opts: RenderOpts = {}) =>
  render(
    <OfflinePackPrompt
      visible={opts.visible ?? true}
      cityName="Paris"
      packState={opts.packState ?? ABSENT}
      errorVisible={opts.errorVisible ?? false}
      onAccept={opts.onAccept ?? jest.fn()}
      onDecline={opts.onDecline ?? jest.fn()}
      onRetry={opts.onRetry ?? jest.fn()}
      onDismiss={opts.onDismiss ?? jest.fn()}
      testID="opp"
    />,
  );

describe('OfflinePackPrompt', () => {
  it('renders title and description with localized cityName', () => {
    renderPrompt();
    expect(screen.getByText(/Paris/)).toBeTruthy();
  });

  it('renders the transparency line (R5)', () => {
    renderPrompt();
    expect(screen.getByText('museum.offlinePack.transparency')).toBeTruthy();
  });

  it('idle: fires onAccept when accept button pressed (R6)', async () => {
    const onAccept = jest.fn();
    renderPrompt({ onAccept });
    fireEvent.press(screen.getByTestId('opp-accept'));
    await new Promise((r) => setTimeout(r, 0));
    expect(onAccept).toHaveBeenCalled();
  });

  it('idle: fires onDecline when decline button pressed (R7)', async () => {
    const onDecline = jest.fn();
    renderPrompt({ onDecline });
    fireEvent.press(screen.getByTestId('opp-decline'));
    await new Promise((r) => setTimeout(r, 0));
    expect(onDecline).toHaveBeenCalled();
  });

  it('active: shows percentage + progressbar role (R2)', () => {
    renderPrompt({
      packState: { status: 'active', percentage: 42, bytesOnDisk: 1024 },
    });
    expect(screen.getByText('42%')).toBeTruthy();
    expect(screen.getByText('museum.offlinePack.downloading')).toBeTruthy();
    const progress = screen.getByTestId('opp-progress');
    expect(progress.props.accessibilityRole).toBe('progressbar');
    expect(progress.props.accessibilityValue.now).toBe(42);
    // idle buttons are gone while active
    expect(screen.queryByTestId('opp-accept')).toBeNull();
    expect(screen.queryByTestId('opp-decline')).toBeNull();
  });

  it('complete: shows size string + close button + fires onDismiss (R3)', async () => {
    const onDismiss = jest.fn();
    renderPrompt({
      packState: { status: 'complete', bytesOnDisk: 20 * 1024 * 1024 },
      onDismiss,
    });
    expect(screen.getByText('museum.offlinePack.completed')).toBeTruthy();
    expect(screen.getByText(/20\.0 MB/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('opp-complete-close'));
    await new Promise((r) => setTimeout(r, 0));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('error: shows error text + retry + close, retry fires onRetry (R4)', async () => {
    const onRetry = jest.fn();
    const onDismiss = jest.fn();
    renderPrompt({ errorVisible: true, onRetry, onDismiss });
    expect(screen.getByText('error.offlinePack.download_failed')).toBeTruthy();
    fireEvent.press(screen.getByTestId('opp-retry'));
    await new Promise((r) => setTimeout(r, 0));
    expect(onRetry).toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('opp-error-close'));
    await new Promise((r) => setTimeout(r, 0));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('error takes precedence over packState (defensive)', () => {
    renderPrompt({
      errorVisible: true,
      packState: { status: 'active', percentage: 50, bytesOnDisk: 0 },
    });
    expect(screen.getByTestId('opp-error')).toBeTruthy();
    expect(screen.queryByTestId('opp-progress')).toBeNull();
  });

  it('does not render content when visible=false', () => {
    renderPrompt({ visible: false });
    expect(screen.queryByTestId('opp-accept')).toBeNull();
  });
});
