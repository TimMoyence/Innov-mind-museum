import { useCallback, useEffect, useState } from 'react';

import type { ReviewDTO, ReviewStatsResponse } from '../infrastructure/reviewApi';
import { reviewApi } from '../infrastructure/reviewApi';

interface UseReviewsReturn {
  reviews: ReviewDTO[];
  stats: ReviewStatsResponse | null;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  submitLoading: boolean;
  submitError: string | null;
  loadMore: () => void;
  submitReview: (rating: number, comment: string, userName: string) => Promise<boolean>;
  clearSubmitError: () => void;
}

const PAGE_SIZE = 10;

export const useReviews = (): UseReviewsReturn => {
  const [reviews, setReviews] = useState<ReviewDTO[]>([]);
  const [stats, setStats] = useState<ReviewStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const hasMore = page < totalPages;

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        setLoading(true);
        setError(null);
        const [statsRes, reviewsRes] = await Promise.all([
          reviewApi.getStats(),
          reviewApi.getReviews(1, PAGE_SIZE),
        ]);
        setStats(statsRes);
        setReviews(reviewsRes.data);
        setTotalPages(reviewsRes.totalPages);
        setPage(1);
      } catch {
        setError('Failed to load reviews');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;

    const nextPage = page + 1;
    setLoading(true);
    reviewApi
      .getReviews(nextPage, PAGE_SIZE)
      .then((res) => {
        setReviews((prev) => [...prev, ...res.data]);
        setTotalPages(res.totalPages);
        setPage(nextPage);
      })
      .catch(() => {
        setError('Failed to load more reviews');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [hasMore, loading, page]);

  const submitReview = useCallback(
    async (rating: number, comment: string, userName: string): Promise<boolean> => {
      setSubmitLoading(true);
      setSubmitError(null);
      try {
        const { review } = await reviewApi.submitReview(rating, comment, userName);
        // Optimistic: add the review locally (backend returns it as pending,
        // it may not appear in the approved list yet, but we show it to the submitter)
        setReviews((prev) => [review, ...prev]);
        setStats((prev) =>
          prev
            ? {
                average: (prev.average * prev.count + rating) / (prev.count + 1),
                count: prev.count + 1,
              }
            : { average: rating, count: 1 },
        );
        return true;
      } catch (err) {
        const message =
          err instanceof Error && err.message.includes('409')
            ? 'already_reviewed'
            : 'submit_failed';
        setSubmitError(message);
        return false;
      } finally {
        setSubmitLoading(false);
      }
    },
    [],
  );

  const clearSubmitError = useCallback(() => {
    setSubmitError(null);
  }, []);

  return {
    reviews,
    stats,
    loading,
    error,
    hasMore,
    submitLoading,
    submitError,
    loadMore,
    submitReview,
    clearSubmitError,
  };
};
