import '../../helpers/test-utils';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { useAudioDescriptionStore } from '@/features/settings/infrastructure/audioDescriptionStore';
import { SettingsAccessibilityCard } from '@/features/settings/ui/SettingsAccessibilityCard';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

const pending: Pending[] = [];

const settle = (index: number): Pending => {
  const write = pending[index];
  if (!write) throw new Error(`écriture ${String(index)} jamais partie`);
  return write;
};

jest.mock('@/shared/api/openapiClient', () => ({
  openApiRequest: () =>
    new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
    }),
}));

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('Décision Tim 2026-11-09 · le dernier choix gagne, carte Accessibilité', () => {
  it('M4 · l’audio-description acceptée au dernier choix n’affiche pas l’échec d’une bascule dépassée', async () => {
    useAudioDescriptionStore.setState({ enabled: false, _hydrated: true });
    render(<SettingsAccessibilityCard />);

    fireEvent(screen.getByRole('switch'), 'valueChange', true);
    fireEvent(screen.getByRole('switch'), 'valueChange', false);
    settle(1).resolve({});
    await flush();
    settle(0).reject(new Error('offline'));
    await flush();

    expect(useAudioDescriptionStore.getState().enabled).toBe(false);
    expect(screen.queryByText('preferences.save_failed')).toBeNull();
  });
});
