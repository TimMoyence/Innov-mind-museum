import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ticketApi } from '@/features/support/infrastructure/ticketApi';
import type { TicketsListViewProps } from '@/features/support/ui/TicketsListView';
import type { components } from '@/shared/api/generated/openapi';
import { getErrorMessage } from '@/shared/lib/errors';

type TicketDTO = components['schemas']['TicketDTO'];
type TicketStatus = TicketDTO['status'];

export const STATUS_OPTIONS: (TicketStatus | 'all')[] = [
  'all',
  'open',
  'in_progress',
  'resolved',
  'closed',
];

export const PAGE_LIMIT = 15;

/**
 * Orchestrates state, pagination, status filter and i18n labels for the tickets list screen.
 * Pure application layer — no JSX. Consumed by `TicketsListView` (presenter).
 * Return shape mirrors `TicketsListViewProps` so the screen wrapper can spread it directly.
 */
export function useTicketsListScreen(): TicketsListViewProps {
  const { t } = useTranslation();

  const [tickets, setTickets] = useState<TicketDTO[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all');

  const loadTickets = useCallback(
    async (requestedPage: number, isRefresh = false) => {
      if (isRefresh) {
        setIsRefreshing(true);
      } else if (requestedPage === 1) {
        setIsLoading(true);
      }
      setError(null);

      try {
        const response = await ticketApi.listTickets({
          page: requestedPage,
          limit: PAGE_LIMIT,
          status: statusFilter === 'all' ? undefined : statusFilter,
        });
        if (requestedPage === 1) {
          setTickets(response.data);
        } else {
          setTickets((prev) => [...prev, ...response.data]);
        }
        setPage(response.page);
        setTotalPages(response.totalPages);
      } catch (loadError) {
        setError(getErrorMessage(loadError));
        if (requestedPage === 1) {
          setTickets([]);
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [statusFilter],
  );

  const loadMore = useCallback(async () => {
    if (page >= totalPages || isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const response = await ticketApi.listTickets({
        page: nextPage,
        limit: PAGE_LIMIT,
        status: statusFilter === 'all' ? undefined : statusFilter,
      });
      setTickets((prev) => [...prev, ...response.data]);
      setPage(response.page);
      setTotalPages(response.totalPages);
    } catch {
      // Silently fail — user can scroll again
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [page, totalPages, statusFilter]);

  useEffect(() => {
    void loadTickets(1);
  }, [loadTickets]);

  const handleStatusFilter = useCallback((newStatus: TicketStatus | 'all') => {
    setStatusFilter(newStatus);
    setPage(1);
  }, []);

  const statusLabel = useCallback(
    (s: TicketStatus | 'all'): string => {
      if (s === 'all') return t('tickets.status');
      const map: Record<TicketStatus, string> = {
        open: t('tickets.statusOpen'),
        in_progress: t('tickets.statusInProgress'),
        resolved: t('tickets.statusResolved'),
        closed: t('tickets.statusClosed'),
      };
      return map[s];
    },
    [t],
  );

  const dismissError = useCallback(() => {
    setError(null);
  }, []);

  return {
    tickets,
    isLoading,
    isRefreshing,
    isLoadingMore,
    error,
    statusFilter,
    loadTickets,
    loadMore,
    handleStatusFilter,
    statusLabel,
    dismissError,
  };
}
