/**
 * Tests for `useRuntimeSettingsStore.mergeFromServer` (TD-2 Option B 2026-05-15).
 *
 * Hydrates locale, museum-mode, and guideLevel from the `/auth/me` payload.
 * Each field is set independently — missing/wrong-shape fields are silently
 * skipped (R5 schema tolerance), valid fields overwrite the local value
 * (server-wins-first — R3).
 */
import '@/__tests__/helpers/test-utils';

import { defaults } from '@/features/settings/runtimeSettings.pure';
import { useRuntimeSettingsStore } from '@/features/settings/infrastructure/runtimeSettingsStore';

describe('useRuntimeSettingsStore.mergeFromServer (TD-2)', () => {
  beforeEach(() => {
    useRuntimeSettingsStore.setState({ ...defaults });
  });

  it('sets defaultLocale when the server payload contains a non-empty string', () => {
    useRuntimeSettingsStore.getState().mergeFromServer({ defaultLocale: 'fr-FR' });
    expect(useRuntimeSettingsStore.getState().defaultLocale).toBe('fr-FR');
  });

  it('sets defaultMuseumMode when the server payload contains a boolean', () => {
    useRuntimeSettingsStore.getState().mergeFromServer({ defaultMuseumMode: false });
    expect(useRuntimeSettingsStore.getState().defaultMuseumMode).toBe(false);
  });

  it('sets guideLevel when the server payload contains a valid enum value', () => {
    useRuntimeSettingsStore.getState().mergeFromServer({ guideLevel: 'expert' });
    expect(useRuntimeSettingsStore.getState().guideLevel).toBe('expert');
  });

  it('merges all three fields atomically when present', () => {
    useRuntimeSettingsStore.getState().mergeFromServer({
      defaultLocale: 'es-ES',
      defaultMuseumMode: false,
      guideLevel: 'intermediate',
    });
    const s = useRuntimeSettingsStore.getState();
    expect(s.defaultLocale).toBe('es-ES');
    expect(s.defaultMuseumMode).toBe(false);
    expect(s.guideLevel).toBe('intermediate');
  });

  it('is a no-op when the payload is fully empty', () => {
    useRuntimeSettingsStore.setState({
      defaultLocale: 'de-DE',
      defaultMuseumMode: false,
      guideLevel: 'expert',
    });
    useRuntimeSettingsStore.getState().mergeFromServer({});
    const s = useRuntimeSettingsStore.getState();
    expect(s.defaultLocale).toBe('de-DE');
    expect(s.defaultMuseumMode).toBe(false);
    expect(s.guideLevel).toBe('expert');
  });

  it('skips defaultLocale when empty string (R5 — server-side bug should not break locale)', () => {
    useRuntimeSettingsStore.setState({ defaultLocale: 'fr-FR' });
    useRuntimeSettingsStore.getState().mergeFromServer({ defaultLocale: '' });
    expect(useRuntimeSettingsStore.getState().defaultLocale).toBe('fr-FR');
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
      defaultLocale: 'en-US',
      defaultMuseumMode: true,
      guideLevel: 'beginner',
    });
    useRuntimeSettingsStore.getState().mergeFromServer({ guideLevel: 'expert' });
    const s = useRuntimeSettingsStore.getState();
    expect(s.defaultLocale).toBe('en-US');
    expect(s.defaultMuseumMode).toBe(true);
    expect(s.guideLevel).toBe('expert');
  });
});
