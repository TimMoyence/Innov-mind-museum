jest.mock('@/features/museum/infrastructure/offlinePackManager', () => ({
  offlinePackManager: {
    hasPack: jest.fn(),
    downloadPack: jest.fn(),
  },
}));

jest.mock('@/features/settings/application/useAutoPreCachePreference', () => ({
  useAutoPreCachePreference: jest.fn(),
}));

jest.mock('@/shared/observability/errorReporting', () => ({
  reportError: jest.fn(),
}));

import { renderHook, waitFor } from '@testing-library/react-native';

import { useGeofencePreCache } from '@/features/museum/application/useGeofencePreCache';
import { offlinePackManager } from '@/features/museum/infrastructure/offlinePackManager';
import { useAutoPreCachePreference } from '@/features/settings/application/useAutoPreCachePreference';
import { reportError } from '@/shared/observability/errorReporting';

const mockedHasPack = offlinePackManager.hasPack as jest.Mock;
const mockedDownload = offlinePackManager.downloadPack as jest.Mock;
const mockedReportError = reportError as jest.Mock;
const mockedPref = useAutoPreCachePreference as jest.Mock;

beforeEach(() => {
  mockedHasPack.mockReset();
  mockedDownload.mockReset();
  mockedPref.mockReset();
  mockedReportError.mockReset();
});

describe('useGeofencePreCache', () => {
  it('no-ops when the auto pre-cache preference is disabled', () => {
    mockedPref.mockReturnValue({ enabled: false, isLoading: false, setEnabled: jest.fn() });
    // Coordinates in central Paris — but the preference is off, so we skip.
    renderHook(() => {
      useGeofencePreCache({ latitude: 48.8566, longitude: 2.3522 });
    });
    expect(mockedHasPack).not.toHaveBeenCalled();
    expect(mockedDownload).not.toHaveBeenCalled();
  });

  it('no-ops when latitude or longitude is null', () => {
    mockedPref.mockReturnValue({ enabled: true, isLoading: false, setEnabled: jest.fn() });
    renderHook(() => {
      useGeofencePreCache({ latitude: null, longitude: null });
    });
    expect(mockedHasPack).not.toHaveBeenCalled();
  });

  it('skips the download when the pack already exists', async () => {
    mockedPref.mockReturnValue({ enabled: true, isLoading: false, setEnabled: jest.fn() });
    mockedHasPack.mockResolvedValue(true);
    renderHook(() => {
      useGeofencePreCache({ latitude: 48.8566, longitude: 2.3522 });
    });
    await waitFor(() => {
      expect(mockedHasPack).toHaveBeenCalledWith('paris');
    });
    expect(mockedDownload).not.toHaveBeenCalled();
  });

  it('fires downloadPack when within 500m of a catalog centroid and no pack exists', async () => {
    mockedPref.mockReturnValue({ enabled: true, isLoading: false, setEnabled: jest.fn() });
    mockedHasPack.mockResolvedValue(false);
    mockedDownload.mockResolvedValue({
      id: 'p1',
      cityId: 'paris',
      bounds: [0, 0, 0, 0],
      bytesOnDisk: 0,
      percentage: 0,
      state: 'active',
    });
    renderHook(() => {
      useGeofencePreCache({ latitude: 48.8566, longitude: 2.3522 });
    });
    await waitFor(() => {
      expect(mockedDownload).toHaveBeenCalled();
    });
    expect((mockedDownload.mock.calls[0][0] as { cityId: string }).cityId).toBe('paris');
  });

  it('does not trigger for cities further than 500m away', async () => {
    mockedPref.mockReturnValue({ enabled: true, isLoading: false, setEnabled: jest.fn() });
    mockedHasPack.mockResolvedValue(false);
    // Coordinates offshore — no city centroid is within 500m.
    renderHook(() => {
      useGeofencePreCache({ latitude: 35.0, longitude: -40.0 });
    });
    // Give the async loop a microtask to settle — no city should match.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockedDownload).not.toHaveBeenCalled();
  });

  it('calls reportError with the city id when downloadPack rejects', async () => {
    mockedPref.mockReturnValue({ enabled: true, isLoading: false, setEnabled: jest.fn() });
    mockedHasPack.mockResolvedValue(false);
    mockedDownload.mockRejectedValue(new Error('network'));

    renderHook(() => {
      useGeofencePreCache({ latitude: 48.8566, longitude: 2.3522 });
    });

    await waitFor(() => {
      expect(mockedReportError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ component: 'useGeofencePreCache', cityId: 'paris' }),
      );
    });
  });

  it('does not re-trigger download for the same city on repeated GPS fixes', async () => {
    mockedPref.mockReturnValue({ enabled: true, isLoading: false, setEnabled: jest.fn() });
    mockedHasPack.mockResolvedValue(false);
    mockedDownload.mockResolvedValue({
      id: 'p1',
      cityId: 'paris',
      bounds: [0, 0, 0, 0],
      bytesOnDisk: 0,
      percentage: 0,
      state: 'active',
    });

    const { rerender } = renderHook(
      ({ lat, lng }: { lat: number; lng: number }) => {
        useGeofencePreCache({ latitude: lat, longitude: lng });
      },
      { initialProps: { lat: 48.8566, lng: 2.3522 } },
    );

    await waitFor(() => {
      expect(mockedDownload).toHaveBeenCalledTimes(1);
    });

    // Simulate GPS jitter — same city, slightly different coordinates.
    rerender({ lat: 48.8567, lng: 2.3523 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mockedDownload).toHaveBeenCalledTimes(1);
  });
});
