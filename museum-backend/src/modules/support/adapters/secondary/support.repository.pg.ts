import { SupportTicket } from '../../domain/supportTicket.entity';
import { TicketMessage } from '../../domain/ticketMessage.entity';

import type { ISupportRepository } from '../../domain/support.repository.interface';
import type {
  CreateTicketInput,
  TicketDTO,
  ListTicketsFilters,
  TicketDetailDTO,
  AddTicketMessageInput,
  TicketMessageDTO,
  UpdateTicketInput,
} from '../../domain/support.types';
import type { PaginatedResult } from '@shared/types/pagination';
import type { DataSource, Repository } from 'typeorm';

/** Map a SupportTicket entity to a TicketDTO. */
function toTicketDTO(entity: SupportTicket, messageCount?: number): TicketDTO {
  return {
    id: entity.id,
    userId: entity.userId,
    subject: entity.subject,
    description: entity.description,
    status: entity.status,
    priority: entity.priority,
    category: entity.category ?? null,
    assignedTo: entity.assignedTo ?? null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
    messageCount,
  };
}

/** Map a TicketMessage entity to a TicketMessageDTO. */
function toMessageDTO(entity: TicketMessage): TicketMessageDTO {
  return {
    id: entity.id,
    ticketId: entity.ticketId,
    senderId: entity.senderId,
    senderRole: entity.senderRole,
    text: entity.text,
    createdAt: entity.createdAt.toISOString(),
  };
}

/** TypeORM implementation of the support repository. */
export class SupportRepositoryPg implements ISupportRepository {
  private readonly ticketRepo: Repository<SupportTicket>;
  private readonly messageRepo: Repository<TicketMessage>;
  private readonly dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
    this.ticketRepo = dataSource.getRepository(SupportTicket);
    this.messageRepo = dataSource.getRepository(TicketMessage);
  }

  /** Inserts a new support ticket and returns the created record. */
  async createTicket(input: CreateTicketInput): Promise<TicketDTO> {
    const entity = this.ticketRepo.create({
      userId: input.userId,
      subject: input.subject,
      description: input.description,
      priority: input.priority ?? 'medium',
      category: input.category ?? null,
    });
    const saved = await this.ticketRepo.save(entity);
    return toTicketDTO(saved);
  }

  /** Retrieves a paginated list of support tickets with optional filters. */
  async listTickets(filters: ListTicketsFilters): Promise<PaginatedResult<TicketDTO>> {
    const { page, limit } = filters.pagination;
    const offset = (page - 1) * limit;

    const qb = this.ticketRepo.createQueryBuilder('t');

    if (filters.userId !== undefined) {
      qb.andWhere('t.userId = :userId', { userId: filters.userId });
    }
    if (filters.status) {
      qb.andWhere('t.status = :status', { status: filters.status });
    }
    if (filters.priority) {
      qb.andWhere('t.priority = :priority', { priority: filters.priority });
    }

    const total = await qb.getCount();

    // Add message count subquery
    const dataQb = qb
      .clone()
      .addSelect((subQuery) => {
        return subQuery.select('COUNT(m.id)').from(TicketMessage, 'm').where('m.ticketId = t.id');
      }, 'messageCount')
      .orderBy('t.updatedAt', 'DESC')
      .offset(offset)
      .limit(limit);

    const { entities, raw } = await dataQb.getRawAndEntities();

    return {
      data: entities.map((entity, idx) =>
        toTicketDTO(entity, Number.parseInt(raw[idx]?.messageCount as string, 10) || 0),
      ),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Retrieves a ticket with its associated messages by ticket ID. */
  async getTicketById(ticketId: string): Promise<TicketDetailDTO | null> {
    const ticket = await this.ticketRepo.findOne({ where: { id: ticketId } });
    if (!ticket) return null;

    const messages = await this.messageRepo.find({
      where: { ticketId },
      order: { createdAt: 'ASC' },
    });

    return {
      ...toTicketDTO(ticket),
      messages: messages.map(toMessageDTO),
    };
  }

  /** Inserts a new message into a ticket and bumps the ticket's updatedAt timestamp. */
  async addMessage(input: AddTicketMessageInput): Promise<TicketMessageDTO> {
    return await this.dataSource.transaction(async (manager) => {
      const msgRepo = manager.getRepository(TicketMessage);
      const tktRepo = manager.getRepository(SupportTicket);

      const entity = msgRepo.create({
        ticketId: input.ticketId,
        senderId: input.senderId,
        senderRole: input.senderRole,
        text: input.text,
      });
      const saved = await msgRepo.save(entity);

      // Bump the ticket's updatedAt
      await tktRepo.update(input.ticketId, { updatedAt: new Date() });

      return toMessageDTO(saved);
    });
  }

  /** Dynamically updates ticket fields (status, priority, assignedTo) and returns the updated record. */
  async updateTicket(input: UpdateTicketInput): Promise<TicketDTO | null> {
    const updates: Partial<SupportTicket> = {};

    if (input.status !== undefined) updates.status = input.status;
    if (input.priority !== undefined) updates.priority = input.priority;
    if (input.assignedTo !== undefined) updates.assignedTo = input.assignedTo;

    if (Object.keys(updates).length === 0) return null;

    const result = await this.ticketRepo.update(input.ticketId, updates);
    if ((result.affected ?? 0) === 0) return null;

    const ticket = await this.ticketRepo.findOne({ where: { id: input.ticketId } });
    return ticket ? toTicketDTO(ticket) : null;
  }

  /** Checks whether a user is the owner of a given support ticket. */
  async isTicketOwner(ticketId: string, userId: number): Promise<boolean> {
    const count = await this.ticketRepo.count({
      where: { id: ticketId, userId },
    });
    return count > 0;
  }

  /**
   * Lists every ticket owned by a user with all attached messages — used by
   * the GDPR DSAR export. Two queries (tickets + messages-by-ticket-id IN ())
   * minimise round-trips on bounded data sets.
   */
  async listForUser(userId: number): Promise<TicketDetailDTO[]> {
    const tickets = await this.ticketRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    if (tickets.length === 0) return [];

    const ticketIds = tickets.map((t) => t.id);
    const messages = await this.messageRepo
      .createQueryBuilder('m')
      .where('m.ticketId IN (:...ticketIds)', { ticketIds })
      .orderBy('m.createdAt', 'ASC')
      .getMany();

    const messagesByTicketId = new Map<string, TicketMessage[]>();
    for (const msg of messages) {
      const list = messagesByTicketId.get(msg.ticketId) ?? [];
      list.push(msg);
      messagesByTicketId.set(msg.ticketId, list);
    }

    return tickets.map((ticket) => ({
      ...toTicketDTO(ticket),
      messages: (messagesByTicketId.get(ticket.id) ?? []).map(toMessageDTO),
    }));
  }
}
