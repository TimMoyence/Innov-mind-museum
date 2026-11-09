import '@/__tests__/helpers/test-utils';

import { useUserProfileStore } from '@/features/settings/infrastructure/userProfileStore';
import type { ContentPreference } from '@/shared/types/content-preference';

describe('useUserProfileStore.mergeFromServer (TD-2)', () => {
  beforeEach(() => {
    useUserProfileStore.setState({ contentPreferences: [], hasSeenOnboarding: false });
  });

  it('sets contentPreferences when the server payload contains an array', () => {
    useUserProfileStore.getState().mergeFromServer({ contentPreferences: ['history'] });
    expect(useUserProfileStore.getState().contentPreferences).toEqual(['history']);
  });

  it('replaces the full preferences array (server-wins-first, not merge-append)', () => {
    useUserProfileStore.setState({ contentPreferences: ['artist'] });
    useUserProfileStore
      .getState()
      .mergeFromServer({ contentPreferences: ['history', 'technique'] });
    expect(useUserProfileStore.getState().contentPreferences).toEqual(['history', 'technique']);
  });

  it('accepts an empty array (server explicitly cleared the preferences)', () => {
    useUserProfileStore.setState({ contentPreferences: ['history', 'artist'] });
    useUserProfileStore.getState().mergeFromServer({ contentPreferences: [] });
    expect(useUserProfileStore.getState().contentPreferences).toEqual([]);
  });

  it('is a no-op when contentPreferences is undefined (server omitted the field)', () => {
    useUserProfileStore.setState({ contentPreferences: ['history'] });
    useUserProfileStore.getState().mergeFromServer({});
    expect(useUserProfileStore.getState().contentPreferences).toEqual(['history']);
  });

  it('is a no-op when contentPreferences is not an array (R5 schema tolerance)', () => {
    useUserProfileStore.setState({ contentPreferences: ['history'] });
    useUserProfileStore
      .getState()
      .mergeFromServer({ contentPreferences: 'history' as unknown as ContentPreference[] });
    expect(useUserProfileStore.getState().contentPreferences).toEqual(['history']);
  });

  it('does not touch unrelated state (hasSeenOnboarding)', () => {
    useUserProfileStore.setState({ hasSeenOnboarding: true, contentPreferences: [] });
    useUserProfileStore.getState().mergeFromServer({ contentPreferences: ['history'] });
    expect(useUserProfileStore.getState().hasSeenOnboarding).toBe(true);
  });

  it('supports sequential merges (last call wins)', () => {
    useUserProfileStore.getState().mergeFromServer({ contentPreferences: ['history'] });
    useUserProfileStore.getState().mergeFromServer({ contentPreferences: ['artist'] });
    expect(useUserProfileStore.getState().contentPreferences).toEqual(['artist']);
  });
});
