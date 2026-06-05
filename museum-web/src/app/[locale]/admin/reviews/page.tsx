'use client';

import { useEffect, useState } from 'react';
import { apiPatch } from '@/lib/api';
import { useAdminDict } from '@/lib/admin-dictionary';
import { useDateLocale, formatDate } from '@/lib/i18n-format';
import { useFetchData } from '@/lib/hooks/useFetchData';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { ExportCsvButton } from '@/components/admin/ExportCsvButton';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { BaseModal } from '@/components/ui/BaseModal';
import { Spinner } from '@/components/ui/Spinner';
import { TableHeaderCell } from '@/components/ui/TableHeaderCell';
import { TableDataCell } from '@/components/ui/TableDataCell';
import type { ReviewDTO, ReviewStatus } from '@/lib/admin-types';
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
  const dateLocale = useDateLocale();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | ''>('pending');

  // Moderation modal state
  const [moderating, setModerating] = useState<ReviewDTO | null>(null);
  const [decision, setDecision] = useState<'approved' | 'rejected' | null>(null);
  const [saving, setSaving] = useState(false);
  // Mutation-specific error (kept distinct from the read-only hook `error`).
  const [mutationError, setMutationError] = useState<string | null>(null);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const reviewsUrl = (() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '20');
    if (statusFilter) params.set('status', statusFilter);
    return `/api/admin/reviews?${params.toString()}`;
  })();

  const {
    data: reviewsPayload,
    loading,
    error,
    pagination,
    refetch: fetchReviews,
  } = useFetchData<ReviewDTO[]>(reviewsUrl, {
    deps: [page, statusFilter],
    errorFallback: 'Failed to load reviews',
  });

  const reviews = reviewsPayload ?? [];
  const totalPages = pagination?.totalPages ?? 0;
  const total = pagination?.total ?? 0;
  const combinedError = error ?? mutationError;

  // -- Moderation handler ─────────────────────────────────────────────

  async function handleModerate() {
    if (!moderating || !decision) return;
    setSaving(true);
    setMutationError(null);
    try {
      await apiPatch<{ review: ReviewDTO }>(`/api/admin/reviews/${moderating.id}`, {
        status: decision,
      });
      setModerating(null);
      setDecision(null);
      void fetchReviews();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Failed to moderate review');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{adminDict.reviewsAdmin}</h1>
          <p className="mt-1 text-text-secondary">{adminDict.reviewsPage.subtitle}</p>
        </div>
        <ExportCsvButton kind="reviews" />
      </div>

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
      {combinedError && <AlertBanner variant="error" message={combinedError} className="mt-4" />}

      {/* Loading */}
      {loading && (
        <div className="mt-12 flex justify-center">
          <Spinner />
        </div>
      )}

      {/* Table */}
      {!loading && (
        <div className="mt-6 overflow-hidden rounded-xl border border-primary-100 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-primary-100 bg-surface-elevated">
                <tr>
                  <TableHeaderCell>{adminDict.common.date}</TableHeaderCell>
                  <TableHeaderCell>{adminDict.reviewsPage.author}</TableHeaderCell>
                  <TableHeaderCell>{adminDict.reviewsPage.rating}</TableHeaderCell>
                  <TableHeaderCell>{adminDict.reviewsPage.comment}</TableHeaderCell>
                  <TableHeaderCell>{adminDict.common.status}</TableHeaderCell>
                  <TableHeaderCell>{adminDict.common.actions}</TableHeaderCell>
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
                      <TableDataCell nowrap>
                        {formatDate(r.createdAt, dateLocale, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </TableDataCell>
                      <TableDataCell nowrap className="font-medium text-text-primary">
                        {r.userName}
                      </TableDataCell>
                      <TableDataCell nowrap className="text-text-primary">
                        {r.rating}/10
                      </TableDataCell>
                      <TableDataCell className="max-w-md truncate">{r.comment}</TableDataCell>
                      <TableDataCell nowrap>
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status]}`}
                        >
                          {adminDict.reviewsPage[r.status]}
                        </span>
                      </TableDataCell>
                      <TableDataCell nowrap>
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
                      </TableDataCell>
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

      {/* Moderation confirm modal (outlier OQ-6: inline footer with green/red
          dynamic button — keeps BaseModal scaffold but not ModalActions). */}
      {moderating && decision && (
        <BaseModal
          open
          onClose={() => {
            setModerating(null);
            setDecision(null);
          }}
          title={
            decision === 'approved'
              ? adminDict.reviewsPage.confirmApprove
              : adminDict.reviewsPage.confirmReject
          }
          size="md"
          dismissable={!saving}
          footer={
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
                  ? '…'
                  : decision === 'approved'
                    ? adminDict.reviewsPage.approve
                    : adminDict.reviewsPage.reject}
              </button>
            </div>
          }
        >
          <p className="mt-2 text-sm text-text-secondary">{moderating.userName}</p>
          <p className="mt-1 text-sm text-text-primary">{moderating.rating}/10</p>
          <blockquote className="mt-3 border-l-4 border-primary-200 pl-4 text-sm italic text-text-secondary">
            {moderating.comment}
          </blockquote>
        </BaseModal>
      )}
    </div>
  );
}
