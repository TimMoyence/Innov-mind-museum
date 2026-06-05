/**
 * RED — Museum picker bug (run 2026-06-01-museum-picker-osm-select).
 *
 * Proves `toPickable` must accept BOTH a local search entry (kind 'local',
 * carrying `museumId`) AND an OSM search entry (kind 'osm', selectable, no
 * `museumId`), while still filtering a favourites/directory entry that lacks a
 * valid id (régression-guard).
 *
 * EXPECTED TO FAIL today on two counts:
 *   1. `toPickable` is not yet exported from MuseumPickerScreen (import →
 *      `undefined` → calling it throws). (R6/R7)
 *   2. The current `toPickable` returns `null` for any entry without an integer
 *      id > 0, so OSM rows are dropped. (R7)
 *
 * Test data via shared factories ONLY (CLAUDE.md test discipline):
 *   - `makeSearchEntryLocal` / `makeSearchEntryOsm` / `makeMuseumListItem`.
 */

import {
  makeMuseumListItem,
  makeSearchEntryLocal,
  makeSearchEntryOsm,
} from '../../helpers/factories/museum.factories';

import type {
  MuseumDirectoryEntry,
  MuseumSearchEntry,
} from '@/features/museum/infrastructure/museumApi';

// `toPickable` is not yet a named export of MuseumPickerScreen (green phase adds
// it). We access it off the module namespace so this RED test compiles under
// `tsc` (no missing-export error), while at runtime the lookup resolves to
// `undefined` → calling it throws → the test FAILS for the right reason. After
// green, the real exported function is exercised unchanged (frozen-test safe).
import * as MuseumPickerModule from '@/features/museum/ui/MuseumPickerScreen';

/** Result shape the picker must produce — discriminated union local | osm. */
type PickableLike =
  | { kind: 'local'; museumId: number; name: string }
  | { kind: 'osm'; name: string; osmKey: string };

const toPickable = (entry: MuseumSearchEntry | MuseumDirectoryEntry): PickableLike | null => {
  const fn = (MuseumPickerModule as unknown as Record<string, unknown>).toPickable;
  return (fn as (e: typeof entry) => PickableLike | null)(entry);
};

describe('toPickable — local vs osm vs directory (R6/R7/R8)', () => {
  it('maps a source:local entry (id > 0) to a PickableMuseum kind "local" carrying museumId', () => {
    const result = toPickable(makeSearchEntryLocal({ id: 7, name: 'Louvre' }));

    expect(result).not.toBeNull();
    expect(result?.kind).toBe('local');
    // Discriminated union: museumId is only present on the local branch.
    if (result?.kind === 'local') {
      expect(result.museumId).toBe(7);
      expect(result.name).toBe('Louvre');
    }
  });

  it('maps a source:osm entry (no id) to a non-null PickableMuseum kind "osm" without museumId', () => {
    const osm = makeSearchEntryOsm({ name: 'Pont de Pierre' });
    const result = toPickable(osm);

    expect(result).not.toBeNull();
    expect(result?.kind).toBe('osm');
    // No museumId on the osm branch; identity is name + coordinates.
    expect(result as Record<string, unknown>).not.toHaveProperty('museumId');
    if (result?.kind === 'osm') {
      expect(result.name).toBe('Pont de Pierre');
      expect(typeof result.osmKey).toBe('string');
      expect(result.osmKey.length).toBeGreaterThan(0);
    }
  });

  it('returns null for a directory/favourites entry lacking a valid integer id (favourites régression-guard)', () => {
    // A directory entry with id coerced to an invalid (non-positive) value must
    // still be filtered out — the favourites path is keyed by DB id.
    const directory = makeMuseumListItem({ id: 0 });
    expect(toPickable(directory)).toBeNull();
  });
});
