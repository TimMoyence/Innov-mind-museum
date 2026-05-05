import { fireEvent, render, waitFor } from '@testing-library/react-native';

import '../../helpers/test-utils';
import { nonNull } from '../../helpers/nonNull';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockDownload = jest.fn();
const mockRemove = jest.fn();
let mockPacksByCity: Record<string, { status: string; percentage?: number; bytesOnDisk?: number }> =
  {};
let mockIsLoading = false;

jest.mock('@/features/museum', () => ({
  useOfflinePacks: () => ({
    packsByCity: mockPacksByCity,
    isLoading: mockIsLoading,
    download: mockDownload,
    remove: mockRemove,
    refresh: jest.fn(),
  }),
  CITY_CATALOG: [
    {
      id: 'paris',
      name: 'Paris',
      bounds: [2.224, 48.815, 2.47, 48.902],
      center: [2.3522, 48.8566],
    },
    {
      id: 'rome',
      name: 'Rome',
      bounds: [12.39, 41.82, 12.59, 41.95],
      center: [12.4964, 41.9028],
    },
  ],
}));

const mockSetEnabled = jest.fn().mockResolvedValue(undefined);
let mockAutoEnabled = false;
let mockAutoLoading = false;

jest.mock('@/features/settings/application/useAutoPreCachePreference', () => ({
  useAutoPreCachePreference: () => ({
    enabled: mockAutoEnabled,
    isLoading: mockAutoLoading,
    setEnabled: mockSetEnabled,
  }),
}));

const mockReportError = jest.fn();
jest.mock('@/shared/observability/errorReporting', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

import { OfflineMapsSettings } from '@/features/settings/ui/OfflineMapsSettings';

describe('OfflineMapsSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPacksByCity = {};
    mockIsLoading = false;
    mockAutoEnabled = false;
    mockAutoLoading = false;
    mockDownload.mockResolvedValue(undefined);
    mockRemove.mockResolvedValue(undefined);
  });

  // ── Header / intro ────────────────────────────────────────────────────────

  it('renders the title and intro copy from i18n', () => {
    const { getByText } = render(<OfflineMapsSettings />);
    expect(getByText('offlineMaps.title')).toBeTruthy();
    expect(getByText('offlineMaps.intro')).toBeTruthy();
  });

  // ── Auto pre-cache toggle ─────────────────────────────────────────────────

  it('renders the auto pre-cache toggle with its label and hint when not loading', () => {
    const { getByText, getByLabelText } = render(<OfflineMapsSettings />);
    expect(getByText('offlineMaps.auto_precache')).toBeTruthy();
    expect(getByText('offlineMaps.auto_precache_hint')).toBeTruthy();
    // Switch is rendered (not the loading indicator) and is accessible by label.
    expect(getByLabelText('offlineMaps.auto_precache')).toBeTruthy();
  });

  it('reflects the persisted enabled flag in the Switch value prop', () => {
    mockAutoEnabled = true;
    const { getByLabelText } = render(<OfflineMapsSettings />);
    const sw = getByLabelText('offlineMaps.auto_precache');
    expect(sw.props.value).toBe(true);
  });

  it('hides the Switch and shows a loader while the auto pre-cache flag is loading', () => {
    mockAutoLoading = true;
    const { queryByLabelText } = render(<OfflineMapsSettings />);
    // Switch is gated behind isAutoPreCacheLoading=false.
    expect(queryByLabelText('offlineMaps.auto_precache')).toBeNull();
  });

  it('calls setEnabled(true) when the Switch is toggled on', async () => {
    const { getByLabelText } = render(<OfflineMapsSettings />);
    const sw = getByLabelText('offlineMaps.auto_precache');
    fireEvent(sw, 'valueChange', true);
    await waitFor(() => {
      expect(mockSetEnabled).toHaveBeenCalledWith(true);
    });
  });

  // ── City list rendering ───────────────────────────────────────────────────

  it('renders one row per city in CITY_CATALOG when not loading', () => {
    const { getByText } = render(<OfflineMapsSettings />);
    expect(getByText('Paris')).toBeTruthy();
    expect(getByText('Rome')).toBeTruthy();
  });

  it('defaults absent state for cities not present in packsByCity', () => {
    mockPacksByCity = {};
    const { getAllByText } = render(<OfflineMapsSettings />);
    // Both rows render their Download button (absent state).
    expect(getAllByText('offlineMaps.download')).toHaveLength(2);
  });

  it('renders the Delete button for cities reported as complete', () => {
    mockPacksByCity = {
      paris: { status: 'complete', bytesOnDisk: 1024 * 1024 },
    };
    const { getByText, getAllByText } = render(<OfflineMapsSettings />);
    expect(getByText('offlineMaps.delete')).toBeTruthy();
    // Rome is still absent.
    expect(getAllByText('offlineMaps.download')).toHaveLength(1);
  });

  it('hides the city list and renders a loader while packs are loading', () => {
    mockIsLoading = true;
    const { queryByText } = render(<OfflineMapsSettings />);
    expect(queryByText('Paris')).toBeNull();
    expect(queryByText('Rome')).toBeNull();
  });

  // ── Download / delete wiring ──────────────────────────────────────────────

  it('calls download(city) with the catalog city object on Download press', async () => {
    const { getAllByText } = render(<OfflineMapsSettings />);
    fireEvent.press(nonNull(getAllByText('offlineMaps.download')[0]));
    await waitFor(() => {
      expect(mockDownload).toHaveBeenCalledTimes(1);
    });
    const arg = mockDownload.mock.calls[0][0] as { id: string; name: string };
    expect(arg.id).toBe('paris');
    expect(arg.name).toBe('Paris');
  });

  it('calls remove(cityId) on Delete press', async () => {
    mockPacksByCity = {
      rome: { status: 'complete', bytesOnDisk: 2 * 1024 * 1024 },
    };
    const { getByText } = render(<OfflineMapsSettings />);
    fireEvent.press(getByText('offlineMaps.delete'));
    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledTimes(1);
    });
    expect(mockRemove).toHaveBeenCalledWith('rome');
  });

  // ── Error reporting on failed mutations ───────────────────────────────────

  it('routes a download failure through reportError with cityId and component context', async () => {
    mockDownload.mockRejectedValueOnce(new Error('disk full'));
    const { getAllByText } = render(<OfflineMapsSettings />);
    fireEvent.press(nonNull(getAllByText('offlineMaps.download')[0]));
    await waitFor(() => {
      expect(mockReportError).toHaveBeenCalledTimes(1);
    });
    const [err, ctx] = mockReportError.mock.calls[0] as [
      Error,
      { component: string; action: string; cityId: string },
    ];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('disk full');
    expect(ctx).toEqual({
      component: 'OfflineMapsSettings',
      action: 'download',
      cityId: 'paris',
    });
  });

  it('routes a remove failure through reportError with the action=remove tag', async () => {
    mockPacksByCity = {
      paris: { status: 'complete', bytesOnDisk: 1024 },
    };
    mockRemove.mockRejectedValueOnce(new Error('not found'));
    const { getByText } = render(<OfflineMapsSettings />);
    fireEvent.press(getByText('offlineMaps.delete'));
    await waitFor(() => {
      expect(mockReportError).toHaveBeenCalledTimes(1);
    });
    const [, ctx] = mockReportError.mock.calls[0] as [
      Error,
      { component: string; action: string; cityId: string },
    ];
    expect(ctx).toEqual({
      component: 'OfflineMapsSettings',
      action: 'remove',
      cityId: 'paris',
    });
  });
});
