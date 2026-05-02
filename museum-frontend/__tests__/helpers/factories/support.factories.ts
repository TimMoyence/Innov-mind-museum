import type { components } from '@/shared/api/generated/openapi';

type TicketDTO = components['schemas']['TicketDTO'];
type TicketDetailDTO = components['schemas']['TicketDetailDTO'];
type TicketMessageDTO = components['schemas']['TicketMessageDTO'];

/** Creates a TicketDTO (list-row shape) with sensible defaults. */
export function makeSupportTicket(overrides: Partial<TicketDTO> = {}): TicketDTO {
  return {
    id: 'ticket-1',
    userId: 1,
    subject: 'Cannot scan artwork',
    description: 'Detailed description of the issue.',
    status: 'open',
    priority: 'medium',
    category: 'bug',
    assignedTo: null,
    createdAt: '2026-03-15T10:00:00.000Z',
    updatedAt: '2026-03-15T10:00:00.000Z',
    messageCount: 0,
    ...overrides,
  };
}

/** Creates a TicketMessageDTO with sensible defaults. */
export function makeTicketMessage(overrides: Partial<TicketMessageDTO> = {}): TicketMessageDTO {
  return {
    id: 'msg-1',
    ticketId: 'ticket-1',
    senderId: 1,
    senderRole: 'visitor',
    text: 'I cannot scan any artworks.',
    createdAt: '2026-03-15T10:00:00.000Z',
    ...overrides,
  };
}

/** Creates a TicketDetailDTO (TicketDTO + messages) with sensible defaults. */
export function makeSupportTicketDetail(overrides: Partial<TicketDetailDTO> = {}): TicketDetailDTO {
  const { messages, ...ticketOverrides } = overrides;
  return {
    ...makeSupportTicket(ticketOverrides),
    messages: messages ?? [makeTicketMessage()],
  };
}
