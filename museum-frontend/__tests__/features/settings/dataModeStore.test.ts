/**
 * Tests for `useDataModePreferenceStore.mergeFromServer` (TD-2 Option B 2026-05-15).
 *
 * Hydrates the data-mode preference (`auto` / `low` / `normal`) from
 * `/auth/me`. Invalid enum values are silently ignored (R5 schema tolerance).
 */
import '@/__tests__/helpers/test-utils';

import { useDataModePreferenceStore } from '@/features/settings/dataModeStore';
import type { DataModePreference } from '@/features/settings/dataModeStore';

describe('useDataModePreferenceStore.mergeFromServer (TD-2)', () => {
  beforeEach(() => {
    useDataModePreferenceStore.setState({ preference: 'auto' });
  });

  it('sets preference to "low" when the server payload contains "low"', () => {
    useDataModePreferenceStore.getState().mergeFromServer({ preference: 'low' });
    expect(useDataModePreferenceStore.getState().preference).toBe('low');
  });

  it('sets preference to "normal" when the server payload contains "normal"', () => {
    useDataModePreferenceStore.getState().mergeFromServer({ preference: 'normal' });
    expect(useDataModePreferenceStore.getState().preference).toBe('normal');
  });

  it('sets preference to "auto" when the server payload contains "auto"', () => {
    useDataModePreferenceStore.setState({ preference: 'low' });
    useDataModePreferenceStore.getState().mergeFromServer({ preference: 'auto' });
    expect(useDataModePreferenceStore.getState().preference).toBe('auto');
  });

  it('is a no-op when preference is undefined', () => {
    useDataModePreferenceStore.setState({ preference: 'low' });
    useDataModePreferenceStore.getState().mergeFromServer({});
    expect(useDataModePreferenceStore.getState().preference).toBe('low');
  });

  it('silently ignores an invalid enum value (R5 schema tolerance)', () => {
    useDataModePreferenceStore.setState({ preference: 'low' });
    useDataModePreferenceStore
      .getState()
      .mergeFromServer({ preference: 'turbo' as unknown as DataModePreference });
    expect(useDataModePreferenceStore.getState().preference).toBe('low');
  });

  it('silently ignores a non-string value', () => {
    useDataModePreferenceStore.setState({ preference: 'auto' });
    useDataModePreferenceStore
      .getState()
      .mergeFromServer({ preference: 1 as unknown as DataModePreference });
    expect(useDataModePreferenceStore.getState().preference).toBe('auto');
  });

  it('supports sequential merges (last valid call wins)', () => {
    useDataModePreferenceStore.getState().mergeFromServer({ preference: 'low' });
    useDataModePreferenceStore.getState().mergeFromServer({ preference: 'normal' });
    expect(useDataModePreferenceStore.getState().preference).toBe('normal');
  });
});
