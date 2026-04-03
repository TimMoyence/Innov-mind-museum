import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAuditLogs } from "@/api/admin.api";
import { Pagination } from "@/components/shared/Pagination";

export function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const limit = 25;

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "audit-logs", { page, action, startDate, endDate, limit }],
    queryFn: () =>
      listAuditLogs({
        page,
        limit,
        action: action || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      }),
    staleTime: 15_000,
  });

  function resetFilters() {
    setAction("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-text-primary">Audit Logs</h1>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">
            Action
          </label>
          <input
            type="text"
            placeholder="e.g. login, role_change"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            className="w-52 rounded-lg border border-primary-200 px-3 py-2 text-sm shadow-sm placeholder:text-text-placeholder focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-primary-200 px-3 py-2 text-sm shadow-sm focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-muted">
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-primary-200 px-3 py-2 text-sm shadow-sm focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
          />
        </div>
        <button
          onClick={resetFilters}
          className="rounded-lg border border-primary-200 px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-muted"
        >
          Clear
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          Failed to load audit logs. {(error as Error).message}
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-primary-100 bg-surface-elevated">
                <th className="px-4 py-3 font-semibold text-text-secondary">
                  Timestamp
                </th>
                <th className="px-4 py-3 font-semibold text-text-secondary">
                  Action
                </th>
                <th className="px-4 py-3 font-semibold text-text-secondary">User</th>
                <th className="px-4 py-3 font-semibold text-text-secondary">
                  Resource
                </th>
                <th className="px-4 py-3 font-semibold text-text-secondary">
                  IP Address
                </th>
                <th className="px-4 py-3 font-semibold text-text-secondary">
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-text-muted">
                    <div className="mx-auto h-6 w-6 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
                  </td>
                </tr>
              )}

              {data?.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-text-muted">
                    No audit logs found.
                  </td>
                </tr>
              )}

              {data?.data.map((log, i) => (
                <tr
                  key={log.id}
                  className={`border-b border-surface-muted transition-colors hover:bg-surface-elevated ${
                    i % 2 === 1 ? "bg-slate-25" : ""
                  }`}
                >
                  <td className="whitespace-nowrap px-4 py-3 text-text-muted">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-md bg-surface-muted px-2 py-0.5 text-xs font-medium text-text-secondary">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {log.userEmail || "System"}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {log.resource}
                    {log.resourceId && (
                      <span className="ml-1 text-xs text-text-placeholder">
                        #{log.resourceId.slice(0, 8)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-muted">
                    {log.ipAddress || "-"}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-xs text-text-muted">
                    {log.details ? JSON.stringify(log.details) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data?.meta && (
          <Pagination
            page={data.meta.page}
            totalPages={data.meta.totalPages}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  );
}
