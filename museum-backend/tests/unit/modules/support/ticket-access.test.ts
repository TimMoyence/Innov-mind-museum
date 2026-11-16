import { hasRole } from '@modules/auth/domain/user/user-role';
import { asTicketMessageView, ticketAccess } from '@modules/support/domain/ticket/ticket-access';

describe('asTicketMessageView', () => {
  const message = {
    id: 'm1',
    ticketId: 't1',
    senderId: 42,
    senderRole: 'admin',
    text: 'Hello',
    createdAt: '2026-11-16T10:00:00.000Z',
  };

  it('marks a message from the ticket author as not from the staff, whatever the role', () => {
    expect(asTicketMessageView({ userId: 42 }, message)).toEqual({ ...message, fromStaff: false });
  });

  it('marks any other sender as staff, even a visitor role', () => {
    expect(
      asTicketMessageView({ userId: 7 }, { ...message, senderRole: 'visitor' }).fromStaff,
    ).toBe(true);
  });
});

describe('ticketAccess', () => {
  const ticket = { userId: 42, museumId: 7 };

  it.each([
    [{ id: 1, role: 'super_admin' }, 'staff'],
    [{ id: 1, role: 'admin', museumId: 3 }, 'staff'],
    [{ id: 1, role: 'moderator' }, 'staff'],
    [{ id: 1, role: 'museum_manager', museumId: 7 }, 'staff'],
    [{ id: 42, role: 'museum_manager', museumId: 8 }, 'author'],
    [{ id: 42, role: 'visitor' }, 'author'],
    [{ id: 1, role: 'museum_manager', museumId: 8 }, null],
    [{ id: 1, role: 'museum_manager', museumId: null }, null],
    [{ id: 1, role: 'museum_manager' }, null],
    [{ id: 1, role: 'visitor' }, null],
    [{ id: 1, role: 'root' }, null],
  ])('%j → %s', (viewer, expected) => {
    expect(ticketAccess(viewer, ticket)).toBe(expected);
  });

  it('keeps a museum manager out of a ticket with no museum', () => {
    expect(
      ticketAccess({ id: 1, role: 'museum_manager', museumId: 7 }, { userId: 42, museumId: null }),
    ).toBeNull();
  });
});

describe('hasRole', () => {
  it.each([
    ['super_admin', [], true],
    ['admin', ['admin'], true],
    ['moderator', ['admin'], false],
    [undefined, ['admin'], false],
  ] as const)('%s in %j → %s', (role, allowed, expected) => {
    expect(hasRole(role, allowed)).toBe(expected);
  });
});
