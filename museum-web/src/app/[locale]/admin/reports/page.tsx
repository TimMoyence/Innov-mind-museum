'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPatch } from '@/lib/api';
import { useAdminDict } from '@/lib/admin-dictionary';
import { AdminPagination } from '@/components/admin/AdminPagination';
import type { PaginatedResponse, Report, ReportStatus } from '@/lib/admin-types';

// -- Status badge colors ----------------------------------------------------------

const STATUS_COLORS: Record<ReportStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  reviewed: 'bg-green-100 text-green-700',
  dismissed: 'bg-gray-100 text-gray-500',
};

const ALL_STATUSES: ReportStatus[] = ['pending', 'reviewed', 'dismissed'];

// -- Page component ---------------------------------------------------------------

export default function ReportsPage() {
  const adminDict = useAdminDict();

  const [reports, setReports] = useState<Report[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Review modal state
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [newStatus, setNewStatus] = useState<ReportStatus>('reviewed');
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isFr = adminDict.dashboard === 'Tableau de bord';

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (statusFilter) params.set('status', statusFilter);

      const data = await apiGet<PaginatedResponse<Report>>(
        `/api/admin/reports?${params.toString()}`,
      );
      setReports(data.data);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  // -- Review handler -------------------------------------------------------------

  async function handleReview() {
    if (!editingReport) return;
    setSubmitting(true);
    try {
      await apiPatch<Report>(`/api/admin/reports/${editingReport.id}`, {
        status: newStatus,
        reviewerNotes,
      });
      setEditingReport(null);
      void fetchReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update report');
    } finally {
      setSubmitting(false);
    }
  }

  // -- Ref for modal backdrop -----------------------------------------------------
  const modalRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary">{adminDict.reports}</h1>
      <p className="mt-1 text-text-secondary">{adminDict.reportsPage.subtitle}</p>

      {/* Filter */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as ReportStatus | '');
          }}
          className="rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        >
          <option value="">{adminDict.common.allStatuses}</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
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
                    {adminDict.common.user}
                  </th>
                  <th className="px-6 py-3 font-medium text-text-secondary">
                    {adminDict.reportsPage.reason}
                  </th>
                  <th className="px-6 py-3 font-medium text-text-secondary">
                    {adminDict.reportsPage.message}
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
                {reports.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-text-muted">
                      {adminDict.reportsPage.noReports}
                    </td>
                  </tr>
                ) : (
                  reports.map((r) => (
                    <tr key={r.id} className="hover:bg-surface-muted/50">
                      <td className="whitespace-nowrap px-6 py-3 text-text-secondary">
                        {new Date(r.createdAt).toLocaleDateString(isFr ? 'fr-FR' : 'en-US', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 font-medium text-text-primary">
                        {r.userId}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-text-secondary">
                        {r.reason}
                      </td>
                      <td
                        className="max-w-xs truncate px-6 py-3 text-text-secondary"
                        title={r.messageText ?? ''}
                      >
                        {r.messageText
                          ? r.messageText.length > 100
                            ? `${r.messageText.slice(0, 100)}...`
                            : r.messageText
                          : '—'}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status]}`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingReport(r);
                            setNewStatus(r.status === 'pending' ? 'reviewed' : r.status);
                            setReviewerNotes(r.reviewerNotes ?? '');
                          }}
                          className="rounded-md px-3 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50"
                        >
                          {adminDict.reportsPage.review}
                        </button>
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

      {/* Review Modal */}
      {editingReport && (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === modalRef.current) setEditingReport(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditingReport(null);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-text-primary">
              {adminDict.reportsPage.reviewReport}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              {adminDict.reportsPage.reason} : {editingReport.reason}
            </p>

            {editingReport.messageText && (
              <div className="mt-3 rounded-lg bg-surface-muted p-3 text-sm text-text-secondary">
                <p className="mb-1 text-xs font-medium text-text-muted">
                  {adminDict.reportsPage.reportedMessage}
                </p>
                {editingReport.messageText}
              </div>
            )}

            <select
              value={newStatus}
              onChange={(e) => {
                setNewStatus(e.target.value as ReportStatus);
              }}
              className="mt-4 w-full rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <textarea
              value={reviewerNotes}
              onChange={(e) => {
                setReviewerNotes(e.target.value);
              }}
              maxLength={2000}
              rows={3}
              placeholder={adminDict.reportsPage.reviewerNotesPlaceholder}
              className="mt-3 w-full rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditingReport(null);
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted"
              >
                {adminDict.common.cancel}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleReview()}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? '...' : adminDict.common.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
