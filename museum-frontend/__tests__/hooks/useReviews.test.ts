import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useReviews } from '@/features/review/application/useReviews';
import type {
  ReviewDTO,
  ReviewStatsResponse,
  ReviewListResponse,
} from '@/features/review/infrastructure/reviewApi';
import { makeReview } from '../helpers/factories/review.factories';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockGetReviews = jest.fn<Promise<ReviewListResponse>, [number?, number?]>();
const mockGetStats = jest.fn<Promise<ReviewStatsResponse>, []>();
const mockSubmitReview = jest.fn<Promise<{ review: ReviewDTO }>, [number, string, string]>();

jest.mock('@/features/review/infrastructure/reviewApi', () => ({
  reviewApi: {
    getReviews: (...args: unknown[]) => mockGetReviews(...(args as [number?, number?])),
    getStats: (...args: unknown[]) => mockGetStats(...(args as [])),
    submitReview: (...args: unknown[]) => mockSubmitReview(...(args as [number, string, string])),
  },
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const defaultStats: ReviewStatsResponse = { average: 4.2, count: 15 };

const makeListResponse = (reviews: ReviewDTO[], page = 1, totalPages = 1): ReviewListResponse => ({
  data: reviews,
  total: reviews.length,
  page,
  limit: 10,
  totalPages,
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useReviews', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetStats.mockResolvedValue(defaultStats);
    mockGetReviews.mockResolvedValue(makeListResponse([makeReview()]));
  });

  it('loads stats and reviews on mount', async () => {
    const { result } = renderHook(() => useReviews());

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockGetStats).toHaveBeenCalledTimes(1);
    expect(mockGetReviews).toHaveBeenCalledWith(1, 10);
    expect(result.current.stats).toEqual(defaultStats);
    expect(result.current.reviews).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('handles load more pagination', async () => {
    const firstPage = [makeReview({ id: 'r1' })];
    const secondPage = [makeReview({ id: 'r2' })];

    mockGetReviews
      .mockResolvedValueOnce(makeListResponse(firstPage, 1, 2))
      .mockResolvedValueOnce(makeListResponse(secondPage, 2, 2));

    const { result } = renderHook(() => useReviews());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasMore).toBe(true);
    expect(result.current.reviews).toHaveLength(1);

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.reviews).toHaveLength(2);
    });

    expect(result.current.reviews[0]?.id).toBe('r1');
    expect(result.current.reviews[1]?.id).toBe('r2');
    expect(result.current.hasMore).toBe(false);
  });

  it('adds review optimistically but does not inflate stats before refetch', async () => {
    const newReview = makeReview({ id: 'new-1', rating: 5, comment: 'Amazing!' });
    mockSubmitReview.mockResolvedValue({ review: newReview });
    // Server returns updated stats after the post-submit refetch
    mockGetStats
      .mockResolvedValueOnce(defaultStats) // initial load
      .mockResolvedValueOnce({ average: 4.3, count: 16 }); // post-submit refetch

    const { result } = renderHook(() => useReviews());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let submitResult = false;
    await act(async () => {
      submitResult = await result.current.submitReview(5, 'Amazing!', 'Alice');
    });

    expect(submitResult).toBe(true);
    // Review is added to the local list immediately
    expect(result.current.reviews[0]?.id).toBe('new-1');
    // Stats come from a server refetch, not a local calculation
    await waitFor(() => {
      expect(result.current.stats?.count).toBe(16);
    });
    expect(mockGetStats).toHaveBeenCalledTimes(2);
  });

  it('sets error on load failure', async () => {
    mockGetStats.mockRejectedValue(new Error('Network error'));
    mockGetReviews.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useReviews());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Failed to load reviews.');
  });

  it('sets already_reviewed error on 409 conflict', async () => {
    mockSubmitReview.mockRejectedValue(new Error('Request failed with status 409'));

    const { result } = renderHook(() => useReviews());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    let submitResult = false;
    await act(async () => {
      submitResult = await result.current.submitReview(5, 'Great', 'Alice');
    });

    expect(submitResult).toBe(false);
    expect(result.current.submitError).toBe('You have already submitted a review.');
  });
});
