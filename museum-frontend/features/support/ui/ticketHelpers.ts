import type { components } from '@/shared/api/generated/openapi';
import { semantic } from '@/shared/ui/tokens.semantic';

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

export const formatDate = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export const formatDateWithTime = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};
