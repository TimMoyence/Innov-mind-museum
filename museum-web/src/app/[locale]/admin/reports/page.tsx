'use client';

import { useEffect, useState } from 'react';
import { apiPatch } from '@/lib/api';
import { useAdminDict } from '@/lib/admin-dictionary';
import { useDateLocale, formatDate } from '@/lib/i18n-format';
import { useFetchData } from '@/lib/hooks/useFetchData';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { BaseModal } from '@/components/ui/BaseModal';
import { ModalActions } from '@/components/ui/ModalActions';
import { Spinner } from '@/components/ui/Spinner';
import { TableHeaderCell } from '@/components/ui/TableHeaderCell';
import { TableDataCell } from '@/components/ui/TableDataCell';
import type { Report, ReportStatus } from '@/lib/admin-types';

// -- Status badge colors ----------------------------------------------------------

const STATUS_COLORS: Record<ReportStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  reviewed: 'bg-green-100 text-green-700',
  dismissed: 'bg-gray-100 text-gray-600',
};

const ALL_STATUSES: ReportStatus[] = ['pending', 'reviewed', 'dismissed'];

// -- Page component ---------------------------------------------------------------

export default function ReportsPage() {
  const adminDict = useAdminDict();

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | ''>('');

  // Review modal state
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [newStatus, setNewStatus] = useState<ReportStatus>('reviewed');
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Mutation-specific error (kept distinct from the read-only hook `error`).
  const [mutationError, setMutationError] = useState<string | null>(null);

  const dateLocale = useDateLocale();

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const reportsUrl = (() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '20');
    if (statusFilter) params.set('status', statusFilter);
    return `/api/admin/reports?${params.toString()}`;
  })();

  const {
    data: reportsPayload,
    loading,
    error,
    pagination,
    refetch: fetchReports,
  } = useFetchData<Report[]>(reportsUrl, {
    deps: [page, statusFilter],
    errorFallback: 'Failed to load reports',
  });

  const reports = reportsPayload ?? [];
  const totalPages = pagination?.totalPages ?? 0;
  const total = pagination?.total ?? 0;
  const combinedError = error ?? mutationError;

  // -- Review handler -------------------------------------------------------------

  async function handleReview() {
    if (!editingReport) return;
    setSubmitting(true);
    setMutationError(null);
    try {
      await apiPatch<Report>(`/api/admin/reports/${editingReport.id}`, {
        status: newStatus,
        reviewerNotes,
      });
      setEditingReport(null);
      void fetchReports();
    } catch (err) {
      setMutationError(err instanceof Error ? err.message : 'Failed to update report');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary">{adminDict.reports}</h1>
      <p className="mt-1 text-text-secondary">{adminDict.reportsPage.subtitle}</p>

      {/* Filter */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          aria-label={adminDict.common.allStatuses}
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
                  <TableHeaderCell>{adminDict.common.user}</TableHeaderCell>
                  <TableHeaderCell>{adminDict.reportsPage.reason}</TableHeaderCell>
                  <TableHeaderCell>{adminDict.reportsPage.message}</TableHeaderCell>
                  <TableHeaderCell>{adminDict.common.status}</TableHeaderCell>
                  <TableHeaderCell>{adminDict.common.actions}</TableHeaderCell>
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
                      <TableDataCell nowrap>
                        {formatDate(r.createdAt, dateLocale, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </TableDataCell>
                      <TableDataCell nowrap className="font-medium text-text-primary">
                        {r.userId}
                      </TableDataCell>
                      <TableDataCell nowrap>{r.reason}</TableDataCell>
                      <TableDataCell className="max-w-xs truncate">
                        <span title={r.messageText ?? ''}>
                          {r.messageText
                            ? r.messageText.length > 100
                              ? `${r.messageText.slice(0, 100)}...`
                              : r.messageText
                            : '—'}
                        </span>
                      </TableDataCell>
                      <TableDataCell nowrap>
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status]}`}
                        >
                          {r.status}
                        </span>
                      </TableDataCell>
                      <TableDataCell nowrap>
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

      {/* Review Modal */}
      {editingReport && (
        <BaseModal
          open
          onClose={() => {
            setEditingReport(null);
          }}
          title={adminDict.reportsPage.reviewReport}
          size="md"
          dismissable={!submitting}
          footer={
            <ModalActions
              cancelLabel={adminDict.common.cancel}
              confirmLabel={adminDict.common.confirm}
              onCancel={() => {
                setEditingReport(null);
              }}
              onConfirm={() => void handleReview()}
              confirmBusy={submitting}
            />
          }
        >
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
            aria-label={adminDict.reportsPage.review}
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
        </BaseModal>
      )}
    </div>
  );
}
