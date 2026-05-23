'use client';

import { useEffect, useState } from 'react';
import { useAdminDict } from '@/lib/admin-dictionary';
import { useDateLocale, formatDate } from '@/lib/i18n-format';
import { useFetchData } from '@/lib/hooks/useFetchData';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { Spinner } from '@/components/ui/Spinner';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { TableHeaderCell } from '@/components/ui/TableHeaderCell';
import { TableDataCell } from '@/components/ui/TableDataCell';
import type { AdminAuditLogDTO } from '@/lib/admin-types';

export default function AuditLogsPage() {
  const adminDict = useAdminDict();
  const dateLocale = useDateLocale();

  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [actionFilter]);

  const logsUrl = (() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', '20');
    if (actionFilter) params.set('action', actionFilter);
    return `/api/admin/audit-logs?${params.toString()}`;
  })();

  const {
    data: logsPayload,
    loading,
    error,
    pagination,
  } = useFetchData<AdminAuditLogDTO[]>(logsUrl, {
    deps: [page, actionFilter],
    errorFallback: 'Failed to load audit logs',
  });

  const logs = logsPayload ?? [];
  const totalPages = pagination?.totalPages ?? 0;
  const total = pagination?.total ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary">{adminDict.auditLogs}</h1>
      <p className="mt-1 text-text-secondary">{adminDict.auditLogsPage.subtitle}</p>

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="text"
          placeholder={adminDict.auditLogsPage.filterPlaceholder}
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
          }}
          className="w-full rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200 sm:max-w-xs"
        />
      </div>

      {/* Error */}
      {error && <AlertBanner variant="error" message={error} className="mt-4" />}

      {/* Loading */}
      {loading && (
        <div className="mt-12 flex justify-center">
          <Spinner />
        </div>
      )}

      {/* Table */}
      {!loading && (
        <div className="mt-6 overflow-hidden rounded-xl border border-primary-100 bg-white">
          {/* WCAG 2.1 AA: scrollable region must be keyboard-reachable (axe-core
              `scrollable-region-focusable` rule). tabIndex={0} + role=region +
              aria-label make this table-container focusable via Tab key.
              Justification: axe-core REQUIRES tabIndex on scrollable containers;
              jsx-a11y's no-noninteractive-tabindex doesn't know it's scrollable.
              Approved-by: pre-launch CI green audit 2026-05-17. */}
          <div
            className="overflow-x-auto"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- axe-core scrollable-region-focusable WCAG 2.1 AA
            tabIndex={0}
            role="region"
            aria-label={adminDict.auditLogsPage.tableAriaLabel}
          >
            <table className="w-full text-left text-sm">
              <thead className="border-b border-primary-100 bg-surface-elevated">
                <tr>
                  <TableHeaderCell>{adminDict.common.date}</TableHeaderCell>
                  <TableHeaderCell>{adminDict.auditLogsPage.columnUser}</TableHeaderCell>
                  <TableHeaderCell>{adminDict.auditLogsPage.columnAction}</TableHeaderCell>
                  <TableHeaderCell>{adminDict.auditLogsPage.columnResource}</TableHeaderCell>
                  <TableHeaderCell>{adminDict.auditLogsPage.columnDetails}</TableHeaderCell>
                  <TableHeaderCell>IP</TableHeaderCell>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-50">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-text-muted">
                      {adminDict.auditLogsPage.emptyState}
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-surface-muted/50">
                      <TableDataCell nowrap>
                        {formatDate(log.createdAt, dateLocale, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </TableDataCell>
                      <TableDataCell nowrap>
                        {log.actorId != null ? `#${String(log.actorId)}` : '—'}
                      </TableDataCell>
                      <TableDataCell nowrap>
                        <span className="inline-block rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700">
                          {log.action}
                        </span>
                      </TableDataCell>
                      <TableDataCell nowrap>
                        {log.targetType ?? '—'}
                        {log.targetId ? ` #${log.targetId.slice(0, 8)}` : ''}
                      </TableDataCell>
                      <TableDataCell className="max-w-xs truncate text-text-muted">
                        {log.metadata ? JSON.stringify(log.metadata) : '—'}
                      </TableDataCell>
                      <TableDataCell nowrap className="text-text-muted">
                        {log.ip ?? '—'}
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
    </div>
  );
}
