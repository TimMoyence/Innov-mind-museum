import '@/__tests__/helpers/test-utils';

import { defaults } from '@/features/settings/runtimeSettings.pure';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';

describe('useRuntimeSettingsStore.mergeFromServer (TD-2)', () => {
  beforeEach(() => {
    useRuntimeSettingsStore.setState({ ...defaults });
  });

  it('sets defaultMuseumMode when the server payload contains a boolean', () => {
    useRuntimeSettingsStore.getState().mergeFromServer({ defaultMuseumMode: false });
    expect(useRuntimeSettingsStore.getState().defaultMuseumMode).toBe(false);
  });

  it('sets guideLevel when the server payload contains a valid enum value', () => {
    useRuntimeSettingsStore.getState().mergeFromServer({ guideLevel: 'expert' });
    expect(useRuntimeSettingsStore.getState().guideLevel).toBe('expert');
  });

  it('merges both fields atomically when present', () => {
    useRuntimeSettingsStore.getState().mergeFromServer({
      defaultMuseumMode: false,
      guideLevel: 'intermediate',
    });
    const s = useRuntimeSettingsStore.getState();
    expect(s.defaultMuseumMode).toBe(false);
    expect(s.guideLevel).toBe('intermediate');
  });

  it('is a no-op when the payload is fully empty', () => {
    useRuntimeSettingsStore.setState({
      defaultMuseumMode: false,
      guideLevel: 'expert',
    });
    useRuntimeSettingsStore.getState().mergeFromServer({});
    const s = useRuntimeSettingsStore.getState();
    expect(s.defaultMuseumMode).toBe(false);
    expect(s.guideLevel).toBe('expert');
  });

  it('skips guideLevel when the value is not a known enum member', () => {
    useRuntimeSettingsStore.setState({ guideLevel: 'beginner' });
    useRuntimeSettingsStore
      .getState()
      .mergeFromServer({ guideLevel: 'master' as unknown as 'expert' });
    expect(useRuntimeSettingsStore.getState().guideLevel).toBe('beginner');
  });

  it('skips defaultMuseumMode when the value is not a boolean', () => {
    useRuntimeSettingsStore.setState({ defaultMuseumMode: true });
    useRuntimeSettingsStore
      .getState()
      .mergeFromServer({ defaultMuseumMode: 'yes' as unknown as boolean });
    expect(useRuntimeSettingsStore.getState().defaultMuseumMode).toBe(true);
  });

  it('updates only the supplied subset, leaves the rest untouched', () => {
    useRuntimeSettingsStore.setState({
      defaultMuseumMode: true,
      guideLevel: 'beginner',
    });
    useRuntimeSettingsStore.getState().mergeFromServer({ guideLevel: 'expert' });
    const s = useRuntimeSettingsStore.getState();
    expect(s.defaultMuseumMode).toBe(true);
    expect(s.guideLevel).toBe('expert');
  });
});
