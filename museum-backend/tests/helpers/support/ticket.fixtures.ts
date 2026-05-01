import { SupportTicket } from '@modules/support/domain/supportTicket.entity';
import { TicketMessage } from '@modules/support/domain/ticketMessage.entity';

/**
 * Test factory for a SupportTicket entity. Override fields via the
 * `overrides` parameter; defaults reflect a typical "open / medium-priority
 * help" ticket.
 * @param overrides
 */
export function makeTicket(overrides: Partial<SupportTicket> = {}): SupportTicket {
  return {
    id: 'ticket-001',
    userId: 1,
    subject: 'Help needed',
    description: 'I have a problem',
    status: 'open',
    priority: 'medium',
    category: null,
    assignedTo: null,
    createdAt: new Date('2025-06-01'),
    updatedAt: new Date('2025-06-01'),
    ...overrides,
  } as SupportTicket;
}

/**
 * Test factory for a TicketMessage entity. Override fields via the
 * `overrides` parameter; defaults reflect a visitor-authored message
 * on `ticket-001`.
 * @param overrides
 */
export function makeTicketMessage(overrides: Partial<TicketMessage> = {}): TicketMessage {
  return {
    id: 'msg-001',
    ticketId: 'ticket-001',
    senderId: 1,
    senderRole: 'visitor',
    text: 'Hello',
    createdAt: new Date('2025-06-01'),
    ...overrides,
  } as TicketMessage;
}
