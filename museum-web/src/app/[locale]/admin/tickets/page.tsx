'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPatch } from '@/lib/api';
import { useAdminDict, useAdminLocale } from '@/lib/admin-dictionary';
import { useDateLocale, formatDate } from '@/lib/i18n-format';
import { AdminPagination } from '@/components/admin/AdminPagination';
import type { PaginatedResponse, Ticket, TicketStatus, TicketPriority } from '@/lib/admin-types';
import { TICKET_STATUSES, TICKET_PRIORITIES } from '@/lib/admin-types';

// -- Badge colors ────────────────────────────────────────────────────────

const STATUS_COLORS: Record<TicketStatus, string> = {
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
};

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
};

// -- Page component ──────────────────────────────────────────────────────

export default function TicketsPage() {
  const adminDict = useAdminDict();
  const locale = useAdminLocale();
  const dateLocale = useDateLocale();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Update modal state
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [newStatus, setNewStatus] = useState<TicketStatus>('open');
  const [newPriority, setNewPriority] = useState<TicketPriority>('low');
  const [saving, setSaving] = useState(false);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, priorityFilter]);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);

      const data = await apiGet<PaginatedResponse<Ticket>>(
        `/api/admin/tickets?${params.toString()}`,
      );
      setTickets(data.data);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, priorityFilter]);

  useEffect(() => {
    void fetchTickets();
  }, [fetchTickets]);

  // -- Update handler ──────────────────────────────────────────────────

  async function handleUpdate() {
    if (!editingTicket) return;
    setSaving(true);
    try {
      await apiPatch<Ticket>(`/api/admin/tickets/${editingTicket.id}`, {
        status: newStatus,
        priority: newPriority,
      });
      setEditingTicket(null);
      void fetchTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update ticket');
    } finally {
      setSaving(false);
    }
  }

  // -- Modal backdrop ref ─────────────────────────────────────────────
  const modalRef = useRef<HTMLDivElement>(null);

  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary">{adminDict.tickets}</h1>
      <p className="mt-1 text-text-secondary">{adminDict.ticketsPage.subtitle}</p>

      {/* Filters */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as TicketStatus | '');
          }}
          className="rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        >
          <option value="">{adminDict.common.allStatuses}</option>
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={(e) => {
            setPriorityFilter(e.target.value as TicketPriority | '');
          }}
          className="rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        >
          <option value="">{adminDict.common.allPriorities}</option>
          {TICKET_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
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
                    {adminDict.common.subject}
                  </th>
                  <th className="px-6 py-3 font-medium text-text-secondary">
                    {adminDict.common.user}
                  </th>
                  <th className="px-6 py-3 font-medium text-text-secondary">
                    {adminDict.common.status}
                  </th>
                  <th className="px-6 py-3 font-medium text-text-secondary">
                    {adminDict.common.priority}
                  </th>
                  <th className="px-6 py-3 font-medium text-text-secondary">
                    {adminDict.common.messages}
                  </th>
                  <th className="px-6 py-3 font-medium text-text-secondary">
                    {adminDict.common.actions}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-50">
                {tickets.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-text-muted">
                      {adminDict.ticketsPage.noTickets}
                    </td>
                  </tr>
                ) : (
                  tickets.map((t) => (
                    <tr key={t.id} className="hover:bg-surface-muted/50">
                      <td className="whitespace-nowrap px-6 py-3 text-text-secondary">
                        {formatDate(t.createdAt, dateLocale, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="max-w-[200px] truncate px-6 py-3 font-medium text-text-primary">
                        {t.subject}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-text-secondary">
                        {t.userId}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[t.status]}`}
                        >
                          {t.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_COLORS[t.priority]}`}
                        >
                          {t.priority}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-text-secondary">
                        {t.messageCount ?? 0}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTicket(t);
                              setNewStatus(t.status);
                              setNewPriority(t.priority);
                            }}
                            className="rounded-md px-3 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50"
                          >
                            {adminDict.ticketsPage.update}
                          </button>
                          <a
                            href={`/${locale}/admin/support?ticket=${t.id}`}
                            className="rounded-md px-3 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50"
                          >
                            {adminDict.ticketsPage.view}
                          </a>
                        </div>
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

      {/* Update Ticket Modal */}
      {editingTicket && (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
          onClick={(e) => {
            if (e.target === modalRef.current) setEditingTicket(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setEditingTicket(null);
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-text-primary">
              {adminDict.ticketsPage.updateTicket}
            </h2>
            <p className="mt-1 text-sm text-text-secondary">{editingTicket.subject}</p>

            <label className="mt-4 block text-sm font-medium text-text-secondary">
              {adminDict.common.status}
            </label>
            <select
              value={newStatus}
              onChange={(e) => {
                setNewStatus(e.target.value as TicketStatus);
              }}
              className="mt-1 w-full rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            <label className="mt-4 block text-sm font-medium text-text-secondary">
              {adminDict.common.priority}
            </label>
            <select
              value={newPriority}
              onChange={(e) => {
                setNewPriority(e.target.value as TicketPriority);
              }}
              className="mt-1 w-full rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm text-text-primary focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
            >
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditingTicket(null);
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-muted"
              >
                {adminDict.common.cancel}
              </button>
              <button
                type="button"
                disabled={
                  saving ||
                  (newStatus === editingTicket.status && newPriority === editingTicket.priority)
                }
                onClick={() => void handleUpdate()}
                className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? '...' : adminDict.common.confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
