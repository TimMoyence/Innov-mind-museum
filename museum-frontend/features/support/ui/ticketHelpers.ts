import type { components } from '@/shared/api/generated/openapi';

type TicketStatus = components['schemas']['TicketDTO']['status'];
type TicketPriority = components['schemas']['TicketDTO']['priority'];

export const BADGE_TEXT_COLOR = '#FFFFFF';

export const statusColor = (status: TicketStatus): string => {
  switch (status) {
    case 'open':
      return '#3B82F6';
    case 'in_progress':
      return '#F59E0B';
    case 'resolved':
      return '#22C55E';
    case 'closed':
      return '#6B7280';
  }
};

export const priorityColor = (priority: TicketPriority): string => {
  switch (priority) {
    case 'low':
      return '#6B7280';
    case 'medium':
      return '#F59E0B';
    case 'high':
      return '#EF4444';
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
