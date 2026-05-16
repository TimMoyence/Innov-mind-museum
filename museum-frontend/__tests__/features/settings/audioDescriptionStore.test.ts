/**
 * Tests for `useAudioDescriptionStore` (TD-2 Option B 2026-05-15).
 *
 * Refactor of the prior `useAudioDescriptionMode` `useState` hook to a
 * Zustand-persist store with cross-device `mergeFromServer` hydration. The
 * compat shim (`useAudioDescriptionMode`) re-exports the same public shape
 * — covered separately by its consumer screens.
 */
import '@/__tests__/helpers/test-utils';

import { useAudioDescriptionStore } from '@/features/settings/infrastructure/audioDescriptionStore';

describe('useAudioDescriptionStore (TD-2)', () => {
  beforeEach(() => {
    useAudioDescriptionStore.setState({ enabled: false, _hydrated: false });
  });

  it('defaults to enabled=false', () => {
    expect(useAudioDescriptionStore.getState().enabled).toBe(false);
  });

  it('setEnabled(true) flips the flag', () => {
    useAudioDescriptionStore.getState().setEnabled(true);
    expect(useAudioDescriptionStore.getState().enabled).toBe(true);
  });

  it('setEnabled(false) clears the flag', () => {
    useAudioDescriptionStore.setState({ enabled: true });
    useAudioDescriptionStore.getState().setEnabled(false);
    expect(useAudioDescriptionStore.getState().enabled).toBe(false);
  });

  it('toggle flips between true and false', () => {
    expect(useAudioDescriptionStore.getState().enabled).toBe(false);
    useAudioDescriptionStore.getState().toggle();
    expect(useAudioDescriptionStore.getState().enabled).toBe(true);
    useAudioDescriptionStore.getState().toggle();
    expect(useAudioDescriptionStore.getState().enabled).toBe(false);
  });

  describe('mergeFromServer', () => {
    it('sets enabled=true when the server payload contains audioDescriptionMode=true', () => {
      useAudioDescriptionStore.getState().mergeFromServer({ audioDescriptionMode: true });
      expect(useAudioDescriptionStore.getState().enabled).toBe(true);
    });

    it('sets enabled=false when the server payload contains audioDescriptionMode=false', () => {
      useAudioDescriptionStore.setState({ enabled: true });
      useAudioDescriptionStore.getState().mergeFromServer({ audioDescriptionMode: false });
      expect(useAudioDescriptionStore.getState().enabled).toBe(false);
    });

    it('is a no-op when audioDescriptionMode is undefined', () => {
      useAudioDescriptionStore.setState({ enabled: true });
      useAudioDescriptionStore.getState().mergeFromServer({});
      expect(useAudioDescriptionStore.getState().enabled).toBe(true);
    });

    it('silently ignores a non-boolean value (R5 schema tolerance)', () => {
      useAudioDescriptionStore.setState({ enabled: true });
      useAudioDescriptionStore
        .getState()
        .mergeFromServer({ audioDescriptionMode: 'yes' as unknown as boolean });
      expect(useAudioDescriptionStore.getState().enabled).toBe(true);
    });

    it('supports sequential merges (last valid call wins)', () => {
      useAudioDescriptionStore.getState().mergeFromServer({ audioDescriptionMode: true });
      useAudioDescriptionStore.getState().mergeFromServer({ audioDescriptionMode: false });
      expect(useAudioDescriptionStore.getState().enabled).toBe(false);
    });
  });
});
