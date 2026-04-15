'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { useAdminDict, useAdminLocale } from '@/lib/admin-dictionary';
import { AdminPagination } from '@/components/admin/AdminPagination';
import type { AuditLog, PaginatedResponse } from '@/lib/admin-types';

export default function AuditLogsPage() {
  const adminDict = useAdminDict();
  const locale = useAdminLocale();
  const isFr = locale === 'fr';

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [actionFilter]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (actionFilter) params.set('action', actionFilter);

      const data = await apiGet<PaginatedResponse<AuditLog>>(
        `/api/admin/audit-logs?${params.toString()}`,
      );
      setLogs(data.data);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

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
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
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
                    {adminDict.auditLogsPage.columnUser}
                  </th>
                  <th className="px-6 py-3 font-medium text-text-secondary">
                    {adminDict.auditLogsPage.columnAction}
                  </th>
                  <th className="px-6 py-3 font-medium text-text-secondary">
                    {adminDict.auditLogsPage.columnResource}
                  </th>
                  <th className="px-6 py-3 font-medium text-text-secondary">
                    {adminDict.auditLogsPage.columnDetails}
                  </th>
                  <th className="px-6 py-3 font-medium text-text-secondary">IP</th>
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
                      <td className="whitespace-nowrap px-6 py-3 text-text-secondary">
                        {new Date(log.createdAt).toLocaleDateString(isFr ? 'fr-FR' : 'en-US', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-text-secondary">
                        {log.userEmail ?? '—'}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3">
                        <span className="inline-block rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700">
                          {log.action}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-text-secondary">
                        {log.resource}
                        {log.resourceId ? ` #${log.resourceId.slice(0, 8)}` : ''}
                      </td>
                      <td className="max-w-xs truncate px-6 py-3 text-text-muted">
                        {log.details ? JSON.stringify(log.details) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-text-muted">
                        {log.ipAddress ?? '—'}
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
    </div>
  );
}
