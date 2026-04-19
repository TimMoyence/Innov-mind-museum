jest.mock('@/features/museum/infrastructure/offlinePackManager', () => ({
  offlinePackManager: {
    listPacks: jest.fn(),
    downloadPack: jest.fn(),
    deletePackByCity: jest.fn(),
  },
}));

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useOfflinePacks } from '@/features/museum/application/useOfflinePacks';
import { findCity } from '@/features/museum/infrastructure/cityCatalog';
import { offlinePackManager } from '@/features/museum/infrastructure/offlinePackManager';

const mockedList = offlinePackManager.listPacks as jest.Mock;
const mockedDownload = offlinePackManager.downloadPack as jest.Mock;
const mockedDelete = offlinePackManager.deletePackByCity as jest.Mock;

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const parisCity = findCity('paris')!;

beforeEach(() => {
  mockedList.mockReset();
  mockedDownload.mockReset();
  mockedDelete.mockReset();
});

describe('useOfflinePacks', () => {
  it('seeds packsByCity from listPacks on mount', async () => {
    mockedList.mockResolvedValue([
      {
        id: 'p1',
        cityId: 'paris',
        bounds: parisCity.bounds,
        bytesOnDisk: 12345,
        percentage: 100,
        state: 'complete',
      },
    ]);

    const { result } = renderHook(() => useOfflinePacks());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.packsByCity.paris).toEqual({
      status: 'complete',
      bytesOnDisk: 12345,
    });
  });

  it('merges progress updates into state then reconciles with listPacks after download', async () => {
    mockedList.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: 'p1',
        cityId: 'paris',
        bounds: parisCity.bounds,
        bytesOnDisk: 500,
        percentage: 100,
        state: 'complete',
      },
    ]);
    mockedDownload.mockImplementation(
      (
        _req: unknown,
        onProgress: (p: {
          cityId: string;
          percentage: number;
          state: string;
          bytesOnDisk: number;
        }) => void,
      ) => {
        onProgress({ cityId: 'paris', percentage: 55, state: 'active', bytesOnDisk: 500 });
        return Promise.resolve({
          id: 'p1',
          cityId: 'paris',
          bounds: parisCity.bounds,
          bytesOnDisk: 500,
          percentage: 55,
          state: 'active',
        });
      },
    );

    const { result } = renderHook(() => useOfflinePacks());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.download(parisCity, 'https://example.com/style.json');
    });

    expect(mockedDownload).toHaveBeenCalled();
    expect(result.current.packsByCity.paris).toEqual({ status: 'complete', bytesOnDisk: 500 });
  });

  it('removes the city from state after remove()', async () => {
    mockedList.mockResolvedValue([
      {
        id: 'p1',
        cityId: 'paris',
        bounds: parisCity.bounds,
        bytesOnDisk: 12345,
        percentage: 100,
        state: 'complete',
      },
    ]);
    mockedDelete.mockResolvedValue(undefined);
    const { result } = renderHook(() => useOfflinePacks());
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.remove('paris');
    });

    expect(mockedDelete).toHaveBeenCalledWith('paris');
    expect(result.current.packsByCity.paris).toBeUndefined();
  });
});
