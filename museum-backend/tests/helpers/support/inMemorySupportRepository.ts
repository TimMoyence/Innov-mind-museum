import { randomUUID } from 'node:crypto';
import type { PaginatedResult } from '@modules/admin/domain/admin.types';
import type { ISupportRepository } from '@modules/support/domain/support.repository.interface';
import type {
  CreateTicketInput,
  TicketDTO,
  ListTicketsFilters,
  TicketDetailDTO,
  AddTicketMessageInput,
  TicketMessageDTO,
  UpdateTicketInput,
} from '@modules/support/domain/support.types';

interface StoredTicket {
  id: string;
  userId: number;
  subject: string;
  description: string;
  status: string;
  priority: string;
  category: string | null;
  assignedTo: number | null;
  createdAt: Date;
  updatedAt: Date;
}

interface StoredMessage {
  id: string;
  ticketId: string;
  senderId: number;
  senderRole: string;
  text: string;
  createdAt: Date;
}

/** In-memory implementation of ISupportRepository for unit tests. */
export class InMemorySupportRepository implements ISupportRepository {
  private tickets: StoredTicket[] = [];
  private messages: StoredMessage[] = [];

  async createTicket(input: CreateTicketInput): Promise<TicketDTO> {
    const ticket: StoredTicket = {
      id: randomUUID(),
      userId: input.userId,
      subject: input.subject,
      description: input.description,
      status: 'open',
      priority: input.priority ?? 'medium',
      category: input.category ?? null,
      assignedTo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.tickets.push(ticket);
    return this.toTicketDTO(ticket);
  }

  async listTickets(filters: ListTicketsFilters): Promise<PaginatedResult<TicketDTO>> {
    let filtered = [...this.tickets];

    if (filters.userId !== undefined) {
      filtered = filtered.filter((t) => t.userId === filters.userId);
    }
    if (filters.status) {
      filtered = filtered.filter((t) => t.status === filters.status);
    }
    if (filters.priority) {
      filtered = filtered.filter((t) => t.priority === filters.priority);
    }

    const total = filtered.length;
    const { page, limit } = filters.pagination;
    const start = (page - 1) * limit;
    const data = filtered.slice(start, start + limit).map((t) => this.toTicketDTO(t));

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getTicketById(ticketId: string): Promise<TicketDetailDTO | null> {
    const ticket = this.tickets.find((t) => t.id === ticketId);
    if (!ticket) return null;

    const ticketMessages = this.messages
      .filter((m) => m.ticketId === ticketId)
      .map((m) => this.toMessageDTO(m));

    return {
      ...this.toTicketDTO(ticket),
      messages: ticketMessages,
    };
  }

  async addMessage(input: AddTicketMessageInput): Promise<TicketMessageDTO> {
    const message: StoredMessage = {
      id: randomUUID(),
      ticketId: input.ticketId,
      senderId: input.senderId,
      senderRole: input.senderRole,
      text: input.text,
      createdAt: new Date(),
    };
    this.messages.push(message);

    // Bump ticket updatedAt
    const ticket = this.tickets.find((t) => t.id === input.ticketId);
    if (ticket) {
      ticket.updatedAt = new Date();
    }

    return this.toMessageDTO(message);
  }

  async updateTicket(input: UpdateTicketInput): Promise<TicketDTO | null> {
    const ticket = this.tickets.find((t) => t.id === input.ticketId);
    if (!ticket) return null;

    if (input.status !== undefined) ticket.status = input.status;
    if (input.priority !== undefined) ticket.priority = input.priority;
    if (input.assignedTo !== undefined) ticket.assignedTo = input.assignedTo;
    ticket.updatedAt = new Date();

    return this.toTicketDTO(ticket);
  }

  async isTicketOwner(ticketId: string, userId: number): Promise<boolean> {
    const ticket = this.tickets.find((t) => t.id === ticketId);
    return ticket?.userId === userId;
  }

  /** Test helper: reset all stored data. */
  clear(): void {
    this.tickets = [];
    this.messages = [];
  }

  /** Test helper: get all stored tickets. */
  getAllTickets(): StoredTicket[] {
    return [...this.tickets];
  }

  /** Test helper: seed a ticket directly. */
  seed(
    ticket: Partial<StoredTicket> & {
      id: string;
      userId: number;
      subject: string;
      description: string;
    },
  ): StoredTicket {
    const full: StoredTicket = {
      status: 'open',
      priority: 'medium',
      category: null,
      assignedTo: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...ticket,
    };
    this.tickets.push(full);
    return full;
  }

  private toTicketDTO(t: StoredTicket): TicketDTO {
    const messageCount = this.messages.filter((m) => m.ticketId === t.id).length;
    return {
      id: t.id,
      userId: t.userId,
      subject: t.subject,
      description: t.description,
      status: t.status,
      priority: t.priority,
      category: t.category,
      assignedTo: t.assignedTo,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      messageCount,
    };
  }

  private toMessageDTO(m: StoredMessage): TicketMessageDTO {
    return {
      id: m.id,
      ticketId: m.ticketId,
      senderId: m.senderId,
      senderRole: m.senderRole,
      text: m.text,
      createdAt: m.createdAt.toISOString(),
    };
  }
}
