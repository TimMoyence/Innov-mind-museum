import '../helpers/test-utils';
import { render, screen } from '@testing-library/react-native';

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
