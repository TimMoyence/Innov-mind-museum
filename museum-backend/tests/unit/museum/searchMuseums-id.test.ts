import { SearchMuseumsUseCase } from '@modules/museum/useCase/search/searchMuseums.useCase';
import { makeMuseum, makeMuseumRepo } from 'tests/helpers/museum/museum.fixtures';

import type { SearchMuseumEntry } from '@modules/museum/useCase/search/searchMuseums.useCase';
import type { OverpassMuseumResult } from '@shared/http/overpass.client';

const PARIS = { lat: 48.8566, lng: 2.3522 };

const makeOsmResult = (
  name: string,
  latOffset: number,
  lonOffset: number,
  osmId = 700,
): OverpassMuseumResult => ({
  name,
  address: null,
  latitude: PARIS.lat + latOffset,
  longitude: PARIS.lng + lonOffset,
  osmId,
  museumType: 'general',
});

const hasId = (entry: SearchMuseumEntry): boolean =>
  'id' in entry && (entry as { id?: unknown }).id !== undefined;

const idOf = (entry: SearchMuseumEntry): unknown => (entry as { id?: unknown }).id;

describe('SearchMuseumsUseCase — local entries expose DB id, OSM entries do not (R1/R2/R3)', () => {
  it('radius search: a source:local entry from Museum id=7 carries id===7, and the OSM entry has no id', async () => {
    const repo = makeMuseumRepo({
      findAll: jest.fn().mockResolvedValue([
        makeMuseum({
          id: 7,
          name: 'Local Seven',
          latitude: PARIS.lat + 0.001,
          longitude: PARIS.lng,
        }),
        makeMuseum({
          id: 9,
          name: 'Local Nine',
          latitude: PARIS.lat + 0.002,
          longitude: PARIS.lng,
        }),
      ]),
    });
    const overpassSearch = jest
      .fn()
      .mockResolvedValue([makeOsmResult('Distinct OSM POI', 0.013, 0.013, 701)]);
    const useCase = new SearchMuseumsUseCase(repo, { overpassSearch });

    const { museums } = await useCase.execute({ ...PARIS, radiusMeters: 10_000 });

    const seven = museums.find((m) => m.name === 'Local Seven');
    const osm = museums.find((m) => m.source === 'osm');

    expect(seven).toBeDefined();
    expect(seven?.source).toBe('local');
    expect(idOf(seven!)).toBe(7);

    expect(osm).toBeDefined();
    expect(hasId(osm!)).toBe(false);
  });

  it('no-coords search (local DB only): each source:local entry carries its Museum.id', async () => {
    const repo = makeMuseumRepo({
      findAll: jest.fn().mockResolvedValue([
        makeMuseum({ id: 7, name: 'Local Seven', latitude: PARIS.lat, longitude: PARIS.lng }),
        makeMuseum({
          id: 9,
          name: 'Local Nine',
          latitude: PARIS.lat + 0.01,
          longitude: PARIS.lng,
        }),
      ]),
    });
    const overpassSearch = jest.fn().mockResolvedValue([]);
    const useCase = new SearchMuseumsUseCase(repo, { overpassSearch });

    const { museums } = await useCase.execute({});

    expect(overpassSearch).not.toHaveBeenCalled();

    const seven = museums.find((m) => m.name === 'Local Seven');
    const nine = museums.find((m) => m.name === 'Local Nine');

    expect(seven?.source).toBe('local');
    expect(idOf(seven!)).toBe(7);
    expect(nine?.source).toBe('local');
    expect(idOf(nine!)).toBe(9);
  });

  it('bbox search: source:local entries inside the bbox carry their Museum.id', async () => {
    const bbox: [number, number, number, number] = [
      PARIS.lng - 0.02,
      PARIS.lat - 0.02,
      PARIS.lng + 0.02,
      PARIS.lat + 0.02,
    ];
    const repo = makeMuseumRepo({
      findInBoundingBox: jest
        .fn()
        .mockResolvedValue([
          makeMuseum({ id: 42, name: 'Bbox Forty-Two', latitude: PARIS.lat, longitude: PARIS.lng }),
        ]),
    });
    const overpassSearch = jest.fn().mockResolvedValue([]);
    const useCase = new SearchMuseumsUseCase(repo, { overpassSearch });

    const { museums } = await useCase.execute({ bbox });

    const inside = museums.find((m) => m.name === 'Bbox Forty-Two');
    expect(inside?.source).toBe('local');
    expect(idOf(inside!)).toBe(42);
  });
});
