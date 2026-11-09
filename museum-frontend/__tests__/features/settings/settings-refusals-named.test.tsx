import '../../helpers/test-utils';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { renderWithQueryClient } from '../../helpers/data/renderWithQueryClient';
import { SettingsPrivacyCard } from '@/features/settings/ui/SettingsPrivacyCard';
import { VoicePreferenceSection } from '@/features/settings/ui/VoicePreferenceSection';

jest.mock('@/features/settings/infrastructure/memoryPreferenceApi', () => ({
  memoryPreferenceApi: {
    get: jest.fn().mockResolvedValue({ enabled: false }),
    update: jest.fn().mockRejectedValue(new Error('Network Error')),
  },
}));

const mockUpdateTtsVoice = jest.fn();
jest.mock('@/features/auth/infrastructure/authApi', () => ({
  authService: { updateTtsVoice: (...args: unknown[]) => mockUpdateTtsVoice(...args) },
}));

describe('M4 · un refus du serveur est nommé dans la carte de réglage où le choix a été fait', () => {
  it('M4 · Personnalisation IA refusée : la carte nomme l’échec et revient à désactivé', async () => {
    render(<SettingsPrivacyCard />);
    await waitFor(() => {
      expect(screen.getByRole('switch')).toBeTruthy();
    });

    fireEvent(screen.getByRole('switch'), 'valueChange', true);

    await waitFor(() => {
      expect(screen.queryByText('preferences.save_failed')).not.toBeNull();
    });
    expect(screen.getByRole('switch').props.value).toBe(false);
  });

  it('M4 · voix de lecture refusée : la carte nomme l’échec', async () => {
    mockUpdateTtsVoice.mockRejectedValue(new Error('Network Error'));
    renderWithQueryClient(<VoicePreferenceSection currentVoice={null} />);

    fireEvent.press(screen.getByTestId('voice-row-alloy'));

    await waitFor(() => {
      expect(screen.queryByText('preferences.save_failed')).not.toBeNull();
    });
  });
});
