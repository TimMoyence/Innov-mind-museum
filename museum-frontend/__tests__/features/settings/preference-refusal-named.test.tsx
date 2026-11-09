import '../../helpers/test-utils';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { useDataModePreferenceStore } from '@/features/settings/dataModeStore';
import { useAudioDescriptionStore } from '@/features/settings/infrastructure/audioDescriptionStore';
import { DataModeSettingsSection } from '@/features/settings/ui/DataModeSettingsSection';
import { SettingsAccessibilityCard } from '@/features/settings/ui/SettingsAccessibilityCard';

const mockOpenApiRequest = jest.fn();
jest.mock('@/shared/api/openapiClient', () => ({
  openApiRequest: (...args: unknown[]) => mockOpenApiRequest(...args),
}));

describe('M4 · un réglage refusé par le serveur nomme son refus là où il a été choisi', () => {
  beforeEach(() => {
    mockOpenApiRequest.mockReset();
    mockOpenApiRequest.mockRejectedValue(new Error('Network Error'));
  });

  it('M4 · un mode données refusé affiche l’échec sous les options et revient au mode du compte', async () => {
    useDataModePreferenceStore.setState({ preference: 'auto' });
    render(<DataModeSettingsSection />);

    fireEvent.press(screen.getByLabelText('settings.dataMode.low'));

    await waitFor(() => {
      expect(screen.getByText('preferences.save_failed')).toBeTruthy();
    });
    expect(useDataModePreferenceStore.getState().preference).toBe('auto');
  });

  it('M4 · une audio-description refusée affiche l’échec dans la carte Accessibilité', async () => {
    useAudioDescriptionStore.setState({ enabled: false, _hydrated: true });
    render(<SettingsAccessibilityCard />);

    fireEvent(screen.getByRole('switch'), 'valueChange', true);

    await waitFor(() => {
      expect(screen.getByText('preferences.save_failed')).toBeTruthy();
    });
    expect(useAudioDescriptionStore.getState().enabled).toBe(false);
  });
});
