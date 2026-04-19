jest.mock('@maplibre/maplibre-react-native', () => ({
  OfflineManager: {
    getPacks: jest.fn(),
    deletePack: jest.fn(),
    createPack: jest.fn(),
  },
}));

jest.mock('@/shared/observability/errorReporting', () => ({
  reportError: jest.fn(),
}));

import { OfflineManager } from '@maplibre/maplibre-react-native';

import type { CityPackProgress } from '@/features/museum/infrastructure/offlinePackManager';
import { offlinePackManager } from '@/features/museum/infrastructure/offlinePackManager';

const mockedGetPacks = OfflineManager.getPacks as jest.Mock;
const mockedDeletePack = OfflineManager.deletePack as jest.Mock;
const mockedCreatePack = OfflineManager.createPack as jest.Mock;

const makePack = (
  id: string,
  cityId: string | null,
  state: 'active' | 'complete' = 'complete',
) => ({
  id,
  metadata: cityId === null ? {} : { cityId },
  bounds: [2.22, 48.8, 2.47, 48.9] as [number, number, number, number],
  status: () =>
    Promise.resolve({
      id,
      state,
      percentage: state === 'complete' ? 100 : 40,
      completedResourceCount: 100,
      completedResourceSize: 123456,
      completedTileCount: 80,
      completedTileSize: 120000,
      requiredResourceCount: 100,
    }),
});

beforeEach(() => {
  mockedGetPacks.mockReset();
  mockedDeletePack.mockReset();
  mockedCreatePack.mockReset();
});

describe('offlinePackManager', () => {
  describe('listPacks', () => {
    it('returns a summary per pack with a valid cityId metadata', async () => {
      mockedGetPacks.mockResolvedValue([makePack('p1', 'paris'), makePack('x', null)]);
      const summaries = await offlinePackManager.listPacks();
      expect(summaries).toHaveLength(1);
      expect(summaries[0]).toMatchObject({ cityId: 'paris', id: 'p1', state: 'complete' });
    });
  });

  describe('hasPack', () => {
    it('returns true when at least one pack matches the cityId', async () => {
      mockedGetPacks.mockResolvedValue([makePack('p1', 'paris')]);
      await expect(offlinePackManager.hasPack('paris')).resolves.toBe(true);
    });

    it('returns false when no pack matches', async () => {
      mockedGetPacks.mockResolvedValue([makePack('p1', 'lyon')]);
      await expect(offlinePackManager.hasPack('paris')).resolves.toBe(false);
    });
  });

  describe('deletePackByCity', () => {
    it('forwards to OfflineManager.deletePack with the native id', async () => {
      mockedGetPacks.mockResolvedValue([makePack('p1', 'paris')]);
      mockedDeletePack.mockResolvedValue(undefined);
      await offlinePackManager.deletePackByCity('paris');
      expect(mockedDeletePack).toHaveBeenCalledWith('p1');
    });

    it('no-ops when no pack exists for the city', async () => {
      mockedGetPacks.mockResolvedValue([]);
      await offlinePackManager.deletePackByCity('paris');
      expect(mockedDeletePack).not.toHaveBeenCalled();
    });
  });

  describe('downloadPack', () => {
    it('returns the existing summary when the city is already fully downloaded', async () => {
      mockedGetPacks.mockResolvedValue([makePack('p1', 'paris', 'complete')]);
      const onProgress = jest.fn();
      const result = await offlinePackManager.downloadPack(
        {
          cityId: 'paris',
          bounds: [2.22, 48.8, 2.47, 48.9],
          mapStyleUrl: 'https://example.com/style.json',
        },
        onProgress,
      );
      expect(result.cityId).toBe('paris');
      expect(mockedCreatePack).not.toHaveBeenCalled();
    });

    it('creates a new pack and forwards progress events scoped to the cityId', async () => {
      mockedGetPacks.mockResolvedValue([]);
      mockedCreatePack.mockImplementation(
        (
          _options: unknown,
          onProg: (
            p: unknown,
            status: { state: string; percentage: number; completedResourceSize: number },
          ) => void,
        ) => {
          onProg({}, { state: 'active', percentage: 42, completedResourceSize: 500 });
          return Promise.resolve(makePack('new-id', 'lyon', 'active'));
        },
      );
      const progress: CityPackProgress[] = [];
      const result = await offlinePackManager.downloadPack(
        {
          cityId: 'lyon',
          bounds: [4.78, 45.7, 4.9, 45.8],
          mapStyleUrl: 'https://example.com/style.json',
        },
        (p) => progress.push(p),
      );
      expect(mockedCreatePack).toHaveBeenCalled();
      expect(progress).toHaveLength(1);
      expect(progress[0]).toMatchObject({ cityId: 'lyon', percentage: 42, state: 'active' });
      expect(result.cityId).toBe('lyon');
    });
  });
});
