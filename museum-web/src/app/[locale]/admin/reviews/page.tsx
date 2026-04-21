'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPatch } from '@/lib/api';
import { useAdminDict, useAdminLocale } from '@/lib/admin-dictionary';
import { AdminPagination } from '@/components/admin/AdminPagination';
import type { PaginatedResponse, ReviewDTO, ReviewStatus } from '@/lib/admin-types';
import { REVIEW_STATUSES, MODERATION_STATUSES } from '@/lib/admin-types';

// -- Badge colors ────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ReviewStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

// -- Page component ──────────────────────────────────────────────────────

export default function AdminReviewsPage() {
  const adminDict = useAdminDict();
  const locale = useAdminLocale();
  const isFr = locale === 'fr';
  const dateLocale = isFr ? 'fr-FR' : 'en-US';

  const [reviews, setReviews] = useState<ReviewDTO[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | ''>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Moderation modal state
  const [moderating, setModerating] = useState<ReviewDTO | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (statusFilter) params.set('status', statusFilter);

      const data = await apiGet<PaginatedResponse<ReviewDTO>>(
        `/api/admin/reviews?${params.toString()}`,
      );
      setReviews(data.data);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    void fetchReviews();
  }, [fetchReviews]);

  // -- Moderation handler ─────────────────────────────────────────────

  async function handleModerate() {
    if (!moderating || !decision) return;
    setSaving(true);
    try {
      await apiPatch<{ review: ReviewDTO }>(`/api/admin/reviews/${moderating.id}`, {
        status: decision,
      });
      setModerating(null);
      setDecision(null);
      void fetchReviews();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to moderate review');
    } finally {
      setSaving(false);
    }
  }

  // -- Modal backdrop ref ─────────────────────────────────────────────
  const modalRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary">{adminDict.reviewsAdmin}</h1>
      <p className="mt-1 text-text-secondary">{adminDict.reviewsPage.subtitle}</p>

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="text-sm font-medium text-text-secondary" htmlFor="review-status-filter">
          {adminDict.reviewsPage.filterStatus}
        </label>
        <select
          id="review-status-filter"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as ReviewStatus | '');
          }}
          className="rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        >
          <option value="">{adminDict.common.allStatuses}</option>
          {REVIEW_STATUSES.map((s) => (
            <option key={s} value={s}>
              {adminDict.reviewsPage[s]}
            </option>
          ))}
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="mt-12 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        </div>
      )}

      {/* Table */}
      {!loading && (
        <div className="mt-6 overflow-hidden rounded-xl border border-primary-100 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-primary-100 bg-surface-elevated">
                <tr>
                  <th className="px-6 py-3 font-medium text-text-secondary">
                    {adminDict.common.date}
                  </th>
                  <th className="px-6 py-3 font-medium text-text-secondary">
                    {adminDict.reviewsPage.author}
                  </th>
                  <th className="px-6 py-3 font-medium text-text-secondary">
                    {adminDict.reviewsPage.rating}
                  </th>
                  <th className="px-6 py-3 font-medium text-text-secondary">
                    {adminDict.reviewsPage.comment}
                  </th>
                  <th className="px-6 py-3 font-medium text-text-secondary">
                    {adminDict.common.status}
                  </th>
                  <th className="px-6 py-3 font-medium text-text-secondary">
                    {adminDict.common.actions}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-50">
                {reviews.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-text-muted">
                      {adminDict.reviewsPage.noReviews}
                    </td>
                  </tr>
                ) : (
                  reviews.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-muted/50">
                      <td className="whitespace-nowrap px-6 py-3 text-text-secondary">
                        {new Date(r.createdAt).toLocaleDateString(dateLocale, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 font-medium text-text-primary">
                        {r.userName}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-text-primary">
                        {r.rating}/5
                      </td>
                      <td className="max-w-md truncate px-6 py-3 text-text-secondary">
                        {r.comment}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status]}`}
                        >
                          {adminDict.reviewsPage[r.status]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3">
                        {r.status === 'pending' ? (
                          <div className="flex items-center gap-2">
                            {MODERATION_STATUSES.map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => {
                                  setModerating(r);
                                  setDecision(s);
                                }}
                                className={`rounded-md px-3 py-1 text-xs font-medium ${
                                  s === 'approved'
                                    ? 'text-green-700 hover:bg-green-50'
                                    : 'text-red-700 hover:bg-red-50'
                                }`}
                              >
                                {adminDict.reviewsPage[s === 'approved' ? 'approve' : 'reject']}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-text-muted">
                            {adminDict.reviewsPage.moderated}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <AdminPagination
            page={page}
            totalPages={totalPages}
            total={total}
            onPageChange={setPage}
          />
        </div>
      )}

      {/* Moderation confirm modal */}
      {moderating && decision && (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- intentional: outside-click + Esc on the backdrop is standard modal behavior
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === modalRef.current) {
              setModerating(null);
              setDecision(null);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setModerating(null);
              setDecision(null);
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-text-primary">
              {decision === 'approved'
                ? adminDict.reviewsPage.confirmApprove
                : adminDict.reviewsPage.confirmReject}
            </h2>
            <p className="mt-2 text-sm text-text-secondary">{moderating.userName}</p>
            <p className="mt-1 text-sm text-text-primary">{moderating.rating}/5</p>
            <blockquote className="mt-3 border-l-4 border-primary-200 pl-4 text-sm italic text-text-secondary">
              {moderating.comment}
            </blockquote>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setModerating(null);
                  setDecision(null);
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted"
              >
                {adminDict.common.cancel}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleModerate()}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                  decision === 'approved'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {saving
                  ? '...'
                  : decision === 'approved'
                    ? adminDict.reviewsPage.approve
                    : adminDict.reviewsPage.reject}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
