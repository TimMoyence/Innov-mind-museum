import { findNearbyMuseums } from '@modules/chat/useCase/nearby-museums.provider';

import { makeMuseum, makeMuseumRepo } from '../../helpers/museum/museum.fixtures';

describe('findNearbyMuseums', () => {
  it('returns museums sorted by distance', async () => {
    const repo = makeMuseumRepo({
      findAll: jest
        .fn()
        .mockResolvedValue([
          makeMuseum({ id: 1, name: 'Far Museum', latitude: 49.0, longitude: 2.5 }),
          makeMuseum({ id: 2, name: 'Close Museum', latitude: 48.857, longitude: 2.353 }),
          makeMuseum({ id: 3, name: 'Closest Museum', latitude: 48.8567, longitude: 2.3523 }),
        ]),
    });

    const result = await findNearbyMuseums(48.8566, 2.3522, repo);

    expect(result[0].name).toBe('Closest Museum');
    expect(result).toHaveLength(3);
    // Verify sorted ascending
    for (let i = 1; i < result.length; i++) {
      expect(result[i].distance).toBeGreaterThanOrEqual(result[i - 1].distance);
    }
  });

  it('limits to 5 results', async () => {
    const museums = Array.from({ length: 10 }, (_, i) =>
      makeMuseum({
        id: i + 1,
        name: `Museum ${String(i)}`,
        latitude: 48.856 + i * 0.001,
        longitude: 2.352,
      }),
    );
    const repo = makeMuseumRepo({ findAll: jest.fn().mockResolvedValue(museums) });

    const result = await findNearbyMuseums(48.8566, 2.3522, repo);

    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('excludes museums without coordinates', async () => {
    const repo = makeMuseumRepo({
      findAll: jest
        .fn()
        .mockResolvedValue([
          makeMuseum({ name: 'No Coords', latitude: null, longitude: null }),
          makeMuseum({ name: 'Has Coords', latitude: 48.857, longitude: 2.353 }),
        ]),
    });

    const result = await findNearbyMuseums(48.8566, 2.3522, repo);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Has Coords');
  });

  it('excludes museums beyond MAX_DISTANCE_METERS (30km)', async () => {
    const repo = makeMuseumRepo({
      findAll: jest
        .fn()
        .mockResolvedValue([makeMuseum({ name: 'Very Far', latitude: 50.0, longitude: 5.0 })]),
    });

    const result = await findNearbyMuseums(48.8566, 2.3522, repo);

    expect(result).toHaveLength(0);
  });

  it('returns empty array when no museums exist', async () => {
    const repo = makeMuseumRepo({ findAll: jest.fn().mockResolvedValue([]) });

    const result = await findNearbyMuseums(48.8566, 2.3522, repo);

    expect(result).toHaveLength(0);
  });

  it('calls findAll with activeOnly filter', async () => {
    const repo = makeMuseumRepo();

    await findNearbyMuseums(48.8566, 2.3522, repo);

    expect(repo.findAll).toHaveBeenCalledWith({ activeOnly: true });
  });
});
