import '../helpers/test-utils';
import { act, waitFor } from '@testing-library/react-native';

import { useMuseumEnrichment } from '@/features/museum/application/useMuseumEnrichment';
import type {
  MuseumEnrichmentResponse,
  MuseumEnrichmentView,
} from '@/features/museum/infrastructure/museumApi';
import { renderHookWithQueryClient } from '@/__tests__/helpers/data/renderWithQueryClient';

const mockGetEnrichment = jest.fn();
const mockGetEnrichmentStatus = jest.fn();

jest.mock('@/features/museum/infrastructure/museumApi', () => {
  const actual = jest.requireActual('@/features/museum/infrastructure/museumApi');
  return {
    ...actual,
    museumApi: {
      ...actual.museumApi,
      getEnrichment: (museumId: number, locale: string) => mockGetEnrichment(museumId, locale),
      getEnrichmentStatus: (museumId: number, locale: string, jobId: string) =>
        mockGetEnrichmentStatus(museumId, locale, jobId),
    },
  };
});

const makeEnrichmentView = (overrides?: Partial<MuseumEnrichmentView>): MuseumEnrichmentView => ({
  museumId: 42,
  locale: 'en',
  summary: 'A fine museum.',
  wikidataQid: 'Q19675',
  website: 'https://example.org',
  phone: '+33 1 23 45 67 89',
  imageUrl: 'https://cdn.example.org/img.jpg',
  openingHours: null,
  fetchedAt: '2026-04-22T10:00:00.000Z',
  ...overrides,
});

const readyResponse = (data?: Partial<MuseumEnrichmentView>): MuseumEnrichmentResponse => ({
  status: 'ready',
  data: makeEnrichmentView(data),
});

const pendingResponse = (jobId: string): MuseumEnrichmentResponse => ({
  status: 'pending',
  jobId,
});

describe('useMuseumEnrichment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('enabled gate', () => {
    it('does not fetch when museumId is null', async () => {
      const { result } = renderHookWithQueryClient(() => useMuseumEnrichment(null, 'en'));

      await act(async () => {
        await Promise.resolve();
      });

      expect(mockGetEnrichment).not.toHaveBeenCalled();
      expect(result.current.status).toBe('idle');
      expect(result.current.data).toBeNull();
    });

    it('does not fetch when museumId is <= 0', async () => {
      const { result } = renderHookWithQueryClient(() => useMuseumEnrichment(0, 'en'));

      await act(async () => {
        await Promise.resolve();
      });

      expect(mockGetEnrichment).not.toHaveBeenCalled();
      expect(result.current.status).toBe('idle');
    });

    it('does not fetch for negative ids (synthetic OSM entries)', async () => {
      const { result } = renderHookWithQueryClient(() => useMuseumEnrichment(-7, 'en'));

      await act(async () => {
        await Promise.resolve();
      });

      expect(mockGetEnrichment).not.toHaveBeenCalled();
      expect(result.current.status).toBe('idle');
    });
  });

  describe('ready first response', () => {
    it('returns data directly when the first response is ready', async () => {
      const view = makeEnrichmentView({ museumId: 1, summary: 'Ready straight away' });
      mockGetEnrichment.mockResolvedValueOnce({ status: 'ready', data: view });

      const { result } = renderHookWithQueryClient(() => useMuseumEnrichment(1, 'en'));

      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });

      expect(mockGetEnrichment).toHaveBeenCalledWith(1, 'en');
      expect(mockGetEnrichmentStatus).not.toHaveBeenCalled();
      expect(result.current.data).toEqual(view);
    });
  });

  describe('polling on pending', () => {
    it('polls the status endpoint at ~1500ms after a pending first response and returns data once ready', async () => {
      jest.useFakeTimers();

      const readyView = makeEnrichmentView({ museumId: 2, summary: 'Finished' });
      mockGetEnrichment.mockResolvedValueOnce(pendingResponse('job-abc'));
      mockGetEnrichmentStatus.mockResolvedValueOnce({ status: 'ready', data: readyView });

      const { result } = renderHookWithQueryClient(() => useMuseumEnrichment(2, 'en'));

      await act(async () => {
        await Promise.resolve();
      });

      expect(mockGetEnrichment).toHaveBeenCalledWith(2, 'en');
      expect(mockGetEnrichmentStatus).not.toHaveBeenCalled();

      await act(async () => {
        await jest.advanceTimersByTimeAsync(1500);
      });

      expect(mockGetEnrichmentStatus).toHaveBeenCalledTimes(1);
      expect(mockGetEnrichmentStatus).toHaveBeenLastCalledWith(2, 'en', 'job-abc');

      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });
      expect(result.current.data).toEqual(readyView);
    });

    it('carries the latest jobId across successive pending responses', async () => {
      jest.useFakeTimers();

      const readyView = makeEnrichmentView({ museumId: 3 });
      mockGetEnrichment.mockResolvedValueOnce(pendingResponse('job-1'));
      mockGetEnrichmentStatus
        .mockResolvedValueOnce(pendingResponse('job-2'))
        .mockResolvedValueOnce({ status: 'ready', data: readyView });

      const { result } = renderHookWithQueryClient(() => useMuseumEnrichment(3, 'en'));

      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        await jest.advanceTimersByTimeAsync(1500);
      });
      expect(mockGetEnrichmentStatus).toHaveBeenNthCalledWith(1, 3, 'en', 'job-1');

      await act(async () => {
        await jest.advanceTimersByTimeAsync(1500);
      });
      expect(mockGetEnrichmentStatus).toHaveBeenNthCalledWith(2, 3, 'en', 'job-2');

      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });
      expect(result.current.data).toEqual(readyView);
    });
  });

  describe('timeout', () => {
    it('stops polling after 30s without a ready response and surfaces null data', async () => {
      jest.useFakeTimers();

      mockGetEnrichment.mockResolvedValueOnce(pendingResponse('job-forever'));
      mockGetEnrichmentStatus.mockImplementation(() =>
        Promise.resolve(pendingResponse('job-forever')),
      );

      const { result } = renderHookWithQueryClient(() => useMuseumEnrichment(4, 'en'));

      await act(async () => {
        await Promise.resolve();
      });

      await act(async () => {
        await jest.advanceTimersByTimeAsync(31_000);
      });

      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });
      expect(result.current.data).toBeNull();
      expect(mockGetEnrichmentStatus.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('refresh()', () => {
    it('refetches and eventually returns the new data', async () => {
      const firstView = makeEnrichmentView({ museumId: 5, summary: 'First' });
      const refreshedView = makeEnrichmentView({ museumId: 5, summary: 'Refreshed' });

      mockGetEnrichment
        .mockResolvedValueOnce(readyResponse(firstView))
        .mockResolvedValueOnce(readyResponse(refreshedView));

      const { result } = renderHookWithQueryClient(() => useMuseumEnrichment(5, 'en'));

      await waitFor(() => {
        expect(result.current.status).toBe('ready');
      });
      expect(result.current.data).toEqual(firstView);

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(mockGetEnrichment).toHaveBeenCalledTimes(2);
      });
      await waitFor(() => {
        expect(result.current.data).toEqual(refreshedView);
      });
    });
  });
});
