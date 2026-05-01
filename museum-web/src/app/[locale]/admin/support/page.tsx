'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiGet, apiPost } from '@/lib/api';
import { useAdminDict, useAdminLocale } from '@/lib/admin-dictionary';
import { useDateLocale, formatDate } from '@/lib/i18n-format';
import type { TicketDetail, TicketMessage, TicketStatus, TicketPriority } from '@/lib/admin-types';

// -- Badge colors (same as tickets page) ------------------------------------

const STATUS_COLORS: Record<TicketStatus, string> = {
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
};

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-orange-100 text-orange-700',
  high: 'bg-red-100 text-red-700',
};

// -- Helpers ----------------------------------------------------------------

function isStaffRole(role: string): boolean {
  return role === 'admin' || role === 'moderator' || role === 'museum_manager';
}

// -- Page component ---------------------------------------------------------

export default function AdminSupportPage() {
  const adminDict = useAdminDict();
  const searchParams = useSearchParams();

  const locale = useAdminLocale();
  const dateLocale = useDateLocale();
  const ticketId = searchParams.get('ticket');

  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);

  // -- Fetch ticket detail --------------------------------------------------

  const fetchTicket = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiGet<{ ticket: TicketDetail }>('/api/support/tickets/' + ticketId);
      setTicket(data.ticket);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ticket');
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    void fetchTicket();
  }, [fetchTicket]);

  // -- Send reply -----------------------------------------------------------

  async function handleSendReply() {
    if (!ticketId || !replyText.trim()) return;
    setSending(true);
    try {
      await apiPost('/api/support/tickets/' + ticketId + '/messages', {
        text: replyText.trim(),
      });
      setReplyText('');
      void fetchTicket();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  }

  // -- No ticket selected ---------------------------------------------------

  if (!ticketId) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{adminDict.supportAdmin}</h1>
        <div className="mt-8 rounded-xl border border-primary-100 bg-white p-12 text-center text-text-muted">
          <p>{adminDict.supportPage.selectTicket}</p>
          <Link
            href={`/${locale}/admin/tickets`}
            className="mt-4 inline-block rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            {adminDict.supportPage.viewTickets}
          </Link>
        </div>
      </div>
    );
  }

  // -- Loading --------------------------------------------------------------

  if (loading && !ticket) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{adminDict.supportAdmin}</h1>
        <div className="mt-12 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        </div>
      </div>
    );
  }

  // -- Error (no ticket loaded) ---------------------------------------------

  if (error && !ticket) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-text-primary">{adminDict.supportAdmin}</h1>
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        <Link
          href={`/${locale}/admin/tickets`}
          className="mt-4 inline-block text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          &larr; {adminDict.supportPage.backToTickets}
        </Link>
      </div>
    );
  }

  if (!ticket) return null;

  // -- Ticket loaded --------------------------------------------------------

  return (
    <div>
      {/* Header + back link */}
      <Link
        href={`/${locale}/admin/tickets`}
        className="text-sm font-medium text-primary-600 hover:text-primary-700"
      >
        &larr; {adminDict.supportPage.backToTickets}
      </Link>

      <h1 className="mt-2 text-2xl font-bold text-text-primary">{adminDict.supportAdmin}</h1>

      {/* Error banner */}
      {error && (
        <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Metadata card */}
      <div className="mt-6 rounded-xl border border-primary-100 bg-white p-6">
        <h2 className="text-lg font-bold text-text-primary">{ticket.subject}</h2>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[ticket.status]}`}
          >
            {ticket.status}
          </span>
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_COLORS[ticket.priority]}`}
          >
            {ticket.priority}
          </span>
        </div>

        <div className="mt-4 grid gap-2 text-sm text-text-secondary sm:grid-cols-2">
          <p>
            <span className="font-medium text-text-primary">{adminDict.common.userId}:</span>{' '}
            {ticket.userId}
          </p>
          <p>
            <span className="font-medium text-text-primary">
              {adminDict.supportPage.createdAt}:
            </span>{' '}
            {formatDate(ticket.createdAt, dateLocale, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>

        {ticket.description && (
          <p className="mt-4 text-sm text-text-secondary whitespace-pre-wrap">
            {ticket.description}
          </p>
        )}
      </div>

      {/* Messages thread */}
      <div className="mt-6 space-y-4">
        <h3 className="text-sm font-semibold text-text-primary">
          {adminDict.common.messages} ({ticket.messages.length})
        </h3>

        {ticket.messages.length === 0 && (
          <p className="text-sm text-text-muted">{adminDict.supportPage.noMessages}</p>
        )}

        {ticket.messages.map((msg: TicketMessage) => {
          const staff = isStaffRole(msg.senderRole);
          return (
            <div
              key={msg.id}
              className={`rounded-xl p-4 ${staff ? 'bg-primary-50 ml-12' : 'bg-gray-50 mr-12'}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    staff ? 'bg-primary-100 text-primary-700' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {msg.senderRole}
                </span>
                <span className="text-xs text-text-muted">
                  {formatDate(msg.createdAt, dateLocale, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              <p className="mt-2 text-sm text-text-primary whitespace-pre-wrap">{msg.text}</p>
            </div>
          );
        })}
      </div>

      {/* Reply form */}
      <div className="mt-6 rounded-xl border border-primary-100 bg-white p-6">
        <h3 className="text-sm font-semibold text-text-primary">{adminDict.supportPage.reply}</h3>
        <textarea
          value={replyText}
          onChange={(e) => {
            setReplyText(e.target.value);
          }}
          rows={4}
          placeholder={adminDict.supportPage.replyPlaceholder}
          className="mt-3 w-full rounded-lg border border-primary-200 bg-white px-4 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200 resize-none"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={sending || !replyText.trim()}
            onClick={() => void handleSendReply()}
            className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {sending ? adminDict.supportPage.sending : adminDict.supportPage.send}
          </button>
        </div>
      </div>
    </div>
  );
}
