import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

/**
 * I-CMP3(3) / R6 — the audio-description `<Switch>` is the very control that
 * turns on the accessibility feature, yet pre-fix it exposes only
 * `value` / `onValueChange` / `trackColor` — no `accessibilityRole`,
 * no `accessibilityLabel`, no `accessibilityState`. A screen-reader user
 * therefore cannot discover or operate it. R6 requires:
 *   - accessibilityRole="switch"
 *   - accessibilityLabel === t('settings.audio_description')
 *   - accessibilityState.checked tracks `enabled`
 *
 * In-repo precedent: SettingsAiConsentCard.tsx:169 (PATTERNS.md react-native §7).
 */

const mockToggle = jest.fn<Promise<void>, []>();
let mockEnabled = false;
const mockIsLoading = false;

jest.mock('@/features/settings/application/useAudioDescriptionMode', () => ({
  useAudioDescriptionMode: () => ({
    enabled: mockEnabled,
    isLoading: mockIsLoading,
    toggle: mockToggle,
  }),
}));

import { SettingsAccessibilityCard } from '@/features/settings/ui/SettingsAccessibilityCard';

describe('SettingsAccessibilityCard (I-CMP3(3) / R6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnabled = false;
  });

  it('exposes the audio-description Switch with role="switch"', () => {
    render(<SettingsAccessibilityCard />);
    // getByRole('switch') only resolves when accessibilityRole="switch" is set.
    expect(screen.getByRole('switch')).toBeTruthy();
  });

  it('labels the Switch with the audio-description i18n key', () => {
    render(<SettingsAccessibilityCard />);
    const sw = screen.getByRole('switch');
    expect(sw.props.accessibilityLabel).toBe('settings.audio_description');
  });

  it('reflects checked=false in accessibilityState when disabled', () => {
    mockEnabled = false;
    render(<SettingsAccessibilityCard />);
    const sw = screen.getByRole('switch');
    expect(sw.props.accessibilityState?.checked).toBe(false);
  });

  it('reflects checked=true in accessibilityState when enabled', () => {
    mockEnabled = true;
    render(<SettingsAccessibilityCard />);
    const sw = screen.getByRole('switch');
    expect(sw.props.accessibilityState?.checked).toBe(true);
  });
});
