import type { TFunction } from 'i18next';

import type { components } from '@/shared/api/generated/openapi';
import { formatAppDate } from '@/shared/lib/formatDate';
import { semantic } from '@/shared/ui/tokens';

type TicketStatus = components['schemas']['TicketDTO']['status'];
type TicketPriority = components['schemas']['TicketDTO']['priority'];

export const BADGE_TEXT_COLOR = semantic.statusBadge.textColor;

export const statusColor = (status: TicketStatus): string => {
  switch (status) {
    case 'open':
      return semantic.statusBadge.open;
    case 'in_progress':
      return semantic.statusBadge.inProgress;
    case 'resolved':
      return semantic.statusBadge.resolved;
    case 'closed':
      return semantic.statusBadge.closed;
  }
};

export const priorityColor = (priority: TicketPriority): string => {
  switch (priority) {
    case 'low':
      return semantic.statusBadge.priorityLow;
    case 'medium':
      return semantic.statusBadge.priorityMedium;
    case 'high':
      return semantic.statusBadge.priorityHigh;
  }
};

const STATUS_KEYS = {
  open: 'tickets.statusOpen',
  in_progress: 'tickets.statusInProgress',
  resolved: 'tickets.statusResolved',
  closed: 'tickets.statusClosed',
} as const satisfies Record<TicketStatus, string>;

const PRIORITY_KEYS = {
  low: 'tickets.priorityLow',
  medium: 'tickets.priorityMedium',
  high: 'tickets.priorityHigh',
} as const satisfies Record<TicketPriority, string>;

export const ticketStatusLabel = (t: TFunction, status: TicketStatus): string =>
  t(STATUS_KEYS[status]);

export const ticketPriorityLabel = (t: TFunction, priority: TicketPriority): string =>
  t(PRIORITY_KEYS[priority]);

export const formatTicketDate = (iso: string, language: string): string | null =>
  formatAppDate(iso, language, { month: 'short', day: 'numeric', year: 'numeric' });

export const formatTicketDateTime = (iso: string, language: string): string | null =>
  formatAppDate(iso, language, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
