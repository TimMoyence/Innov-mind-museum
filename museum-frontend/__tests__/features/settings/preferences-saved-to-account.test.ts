import { useDataModePreferenceStore } from '@/features/settings/dataModeStore';
import { useAudioDescriptionStore } from '@/features/settings/infrastructure/audioDescriptionStore';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';

const mockOpenApiRequest = jest.fn();
jest.mock('@/shared/api/openapiClient', () => ({
  openApiRequest: (...args: unknown[]) => mockOpenApiRequest(...args),
}));

jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));

const patchedWith = (body: Record<string, unknown>) =>
  expect.objectContaining({
    path: '/api/auth/me/preferences',
    method: 'patch',
    json: body,
  });

describe('M4 · un réglage choisi est écrit sur le compte', () => {
  beforeEach(() => {
    mockOpenApiRequest.mockReset();
    mockOpenApiRequest.mockResolvedValue({});
  });

  it('M4 · le niveau du guide choisi est écrit sur le compte', () => {
    useRuntimeSettingsStore.getState().setGuideLevel('expert');

    expect(useRuntimeSettingsStore.getState().guideLevel).toBe('expert');
    expect(mockOpenApiRequest).toHaveBeenCalledWith(patchedWith({ guideLevel: 'expert' }));
  });

  it('M4 · le mode guidé choisi est écrit sur le compte', () => {
    useRuntimeSettingsStore.getState().setDefaultMuseumMode(false);

    expect(mockOpenApiRequest).toHaveBeenCalledWith(patchedWith({ defaultMuseumMode: false }));
  });

  it('M4 · le mode données choisi est écrit sur le compte', () => {
    useDataModePreferenceStore.getState().setPreference('low');

    expect(mockOpenApiRequest).toHaveBeenCalledWith(patchedWith({ dataMode: 'low' }));
  });

  it('M4 · l’audio-description activée est écrite sur le compte', () => {
    useAudioDescriptionStore.setState({ enabled: false });

    useAudioDescriptionStore.getState().toggle();

    expect(mockOpenApiRequest).toHaveBeenCalledWith(patchedWith({ audioDescriptionMode: true }));
  });

  it('M4 · le réglage relu au démarrage n’est pas réécrit sur le compte', () => {
    useRuntimeSettingsStore.getState().mergeFromServer({ guideLevel: 'intermediate' });

    expect(useRuntimeSettingsStore.getState().guideLevel).toBe('intermediate');
    expect(mockOpenApiRequest).not.toHaveBeenCalled();
  });
});
