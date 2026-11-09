import '../../helpers/test-utils';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { useDataModePreferenceStore } from '@/features/settings/dataModeStore';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';
import { DataModeSettingsSection } from '@/features/settings/ui/DataModeSettingsSection';

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

jest.mock('@/shared/i18n/I18nContext', () => ({
  useI18n: () => ({ language: 'fr', setLanguage: jest.fn() }),
}));

jest.mock('@/features/settings/ui/ContentPreferencesCard', () => ({
  ContentPreferencesCard: () => null,
}));

import PreferencesScreen from '@/app/(stack)/preferences';

const flush = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

describe('Décision Tim 2026-11-09 · le dernier choix gagne : seule sa réponse s’affiche', () => {
  beforeEach(() => {
    pending.length = 0;
  });

  it('M4 · un mode données accepté au dernier choix n’affiche pas l’échec d’un choix dépassé', async () => {
    useDataModePreferenceStore.setState({ preference: 'auto' });
    render(<DataModeSettingsSection />);

    fireEvent.press(screen.getByLabelText('settings.dataMode.low'));
    fireEvent.press(screen.getByLabelText('settings.dataMode.normal'));
    settle(1).resolve({});
    await flush();
    settle(0).reject(new Error('offline'));
    await flush();

    expect(useDataModePreferenceStore.getState().preference).toBe('normal');
    expect(screen.queryByText('preferences.save_failed')).toBeNull();
  });

  it('M4 · un double Enregistrer dont le dernier est refusé n’annonce pas « Enregistré »', async () => {
    useRuntimeSettingsStore.setState({
      defaultMuseumMode: true,
      guideLevel: 'beginner',
      _hydrated: true,
    });
    render(<PreferencesScreen />);

    fireEvent.press(screen.getByLabelText('a11y.preferences.save'));
    fireEvent.press(screen.getByLabelText('a11y.preferences.save'));
    settle(2).reject(new Error('offline'));
    settle(3).reject(new Error('offline'));
    await flush();
    settle(0).resolve({});
    settle(1).resolve({});
    await flush();

    expect(screen.getByText('preferences.save_failed')).toBeTruthy();
    expect(screen.queryByText('preferences.saved')).toBeNull();
  });
});
