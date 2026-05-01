import { useOfflinePackChoiceStore } from '@/features/museum/infrastructure/offlinePackChoiceStore';

beforeEach(() => useOfflinePackChoiceStore.setState({ choices: {} }));

describe('offlinePackChoiceStore', () => {
  it('records accept choice', () => {
    useOfflinePackChoiceStore.getState().acceptOfflinePack('paris');
    const choice = useOfflinePackChoiceStore.getState().getChoice('paris');
    expect(choice?.decision).toBe('accepted');
    expect(choice?.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('records decline choice and overwrites prior accept', () => {
    useOfflinePackChoiceStore.getState().acceptOfflinePack('paris');
    useOfflinePackChoiceStore.getState().declineOfflinePack('paris');
    expect(useOfflinePackChoiceStore.getState().getChoice('paris')?.decision).toBe('declined');
  });

  it('returns undefined for cities with no choice', () => {
    expect(useOfflinePackChoiceStore.getState().getChoice('lyon')).toBeUndefined();
  });

  it('clearChoice removes the entry', () => {
    useOfflinePackChoiceStore.getState().acceptOfflinePack('paris');
    useOfflinePackChoiceStore.getState().clearChoice('paris');
    expect(useOfflinePackChoiceStore.getState().getChoice('paris')).toBeUndefined();
  });
});
