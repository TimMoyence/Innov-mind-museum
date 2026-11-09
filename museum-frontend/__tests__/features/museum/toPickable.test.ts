import {
  makeMuseumListItem,
  makeSearchEntryLocal,
  makeSearchEntryOsm,
} from '../../helpers/factories/museum.factories';

import type {
  MuseumDirectoryEntry,
  MuseumSearchEntry,
} from '@/features/museum/infrastructure/museumApi';

import * as MuseumPickerModule from '@/features/museum/ui/MuseumPickerScreen';

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
    expect(result as Record<string, unknown>).not.toHaveProperty('museumId');
    if (result?.kind === 'osm') {
      expect(result.name).toBe('Pont de Pierre');
      expect(typeof result.osmKey).toBe('string');
      expect(result.osmKey.length).toBeGreaterThan(0);
    }
  });

  it('returns null for a directory/favourites entry lacking a valid integer id (favourites régression-guard)', () => {
    const directory = makeMuseumListItem({ id: 0 });
    expect(toPickable(directory)).toBeNull();
  });
});
