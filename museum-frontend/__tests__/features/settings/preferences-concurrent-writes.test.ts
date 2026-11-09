import { useDataModePreferenceStore } from '@/features/settings/dataModeStore';
import { useAudioDescriptionStore } from '@/features/settings/infrastructure/audioDescriptionStore';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';

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

const mockOpenApiRequest = jest.fn(
  () =>
    new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
    }),
);

jest.mock('@/shared/api/openapiClient', () => ({
  openApiRequest: () => mockOpenApiRequest(),
}));

jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));

describe('M4 · après des écritures qui se croisent, l’appli montre ce que tient le compte', () => {
  beforeEach(() => {
    pending.length = 0;
  });

  it('M4 · deux bascules refusées de suite laissent l’audio-description du compte, pas une valeur refusée', async () => {
    useAudioDescriptionStore.setState({ enabled: false });

    const first = useAudioDescriptionStore.getState().setEnabled(true);
    const second = useAudioDescriptionStore.getState().setEnabled(false);
    settle(0).reject(new Error('offline'));
    settle(1).reject(new Error('offline'));
    await Promise.all([first, second]);

    expect(useAudioDescriptionStore.getState().enabled).toBe(false);
  });

  it('M4 · un mode données accepté puis un autre refusé laissent le mode accepté', async () => {
    useDataModePreferenceStore.setState({ preference: 'auto' });

    const first = useDataModePreferenceStore.getState().setPreference('low');
    const second = useDataModePreferenceStore.getState().setPreference('normal');
    settle(0).resolve({});
    settle(1).reject(new Error('offline'));
    await Promise.all([first, second]);

    expect(useDataModePreferenceStore.getState().preference).toBe('low');
  });

  it('M4 · un double Enregistrer refusé puis accepté garde le niveau choisi', async () => {
    useRuntimeSettingsStore.setState({ guideLevel: 'beginner' });

    const first = useRuntimeSettingsStore.getState().setGuideLevel('expert');
    const second = useRuntimeSettingsStore.getState().setGuideLevel('expert');
    settle(0).reject(new Error('offline'));
    settle(1).resolve({});
    await Promise.all([first, second]);

    expect(useRuntimeSettingsStore.getState().guideLevel).toBe('expert');
  });
});
