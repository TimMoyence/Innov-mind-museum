import { hasRole, MUSEUM_STAFF_ROLES, UserRole } from '@modules/auth/domain/user/user-role';
import { isOutsideMuseumScope } from '@shared/authz/tenant-scope';

import type {
  TicketDTO,
  TicketMessageDTO,
  TicketMessageView,
} from '@modules/support/domain/ticket/support.types';

interface TicketViewer {
  id: number;
  role: string;
  museumId?: number | null;
}

export function ticketAccess(
  viewer: TicketViewer,
  ticket: Pick<TicketDTO, 'userId' | 'museumId'>,
): 'staff' | 'author' | null {
  const staff =
    viewer.role === UserRole.MUSEUM_MANAGER
      ? viewer.museumId != null && !isOutsideMuseumScope(viewer.museumId, ticket.museumId)
      : hasRole(viewer.role, MUSEUM_STAFF_ROLES);
  if (staff) return 'staff';
  return ticket.userId === viewer.id ? 'author' : null;
}

export const asTicketMessageView = (
  ticket: Pick<TicketDTO, 'userId'>,
  message: TicketMessageDTO,
): TicketMessageView => ({ ...message, fromStaff: message.senderId !== ticket.userId });
