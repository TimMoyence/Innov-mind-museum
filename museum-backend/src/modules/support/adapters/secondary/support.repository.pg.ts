/* eslint-disable @typescript-eslint/no-unnecessary-condition -- defensive: raw SQL row fields may be null at runtime */
import pool from '@data/db';

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
import type { PaginatedResult } from '@modules/admin/domain/admin.types';

/** Map a raw support_tickets row to a TicketDTO. */
function mapTicketRow(row: Record<string, unknown>): TicketDTO {
  return {
    id: row.id as string,
    userId: row.userId as number,
    subject: row.subject as string,
    description: row.description as string,
    status: row.status as string,
    priority: row.priority as string,
    category: (row.category as string) ?? null,
    assignedTo: (row.assigned_to as number) ?? null,
    createdAt: (row.createdAt as Date).toISOString(),
    updatedAt: (row.updatedAt as Date).toISOString(),
    messageCount:
      row.message_count !== undefined
        ? Number.parseInt(row.message_count as string, 10)
        : undefined,
  };
}

/** Map a raw ticket_messages row to a TicketMessageDTO. */
function mapMessageRow(row: Record<string, unknown>): TicketMessageDTO {
  return {
    id: row.id as string,
    ticketId: row.ticket_id as string,
    senderId: row.sender_id as number,
    senderRole: row.sender_role as string,
    text: row.text as string,
    createdAt: (row.createdAt as Date).toISOString(),
  };
}

/** PostgreSQL implementation of the support repository. */
export class SupportRepositoryPg implements ISupportRepository {
  /** Inserts a new support ticket and returns the created record. */
  async createTicket(input: CreateTicketInput): Promise<TicketDTO> {
    const result = await pool.query(
      `INSERT INTO "support_tickets" ("userId", "subject", "description", "priority", "category")
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *, "assigned_to"`,
      [
        input.userId,
        input.subject,
        input.description,
        input.priority ?? 'medium',
        input.category ?? null,
      ],
    );
    return mapTicketRow(result.rows[0]);
  }

  /** Retrieves a paginated list of support tickets with optional filters. */
  async listTickets(filters: ListTicketsFilters): Promise<PaginatedResult<TicketDTO>> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters.userId !== undefined) {
      conditions.push(`t."userId" = $${idx}`);
      values.push(filters.userId);
      idx++;
    }

    if (filters.status) {
      conditions.push(`t."status" = $${idx}`);
      values.push(filters.status);
      idx++;
    }

    if (filters.priority) {
      conditions.push(`t."priority" = $${idx}`);
      values.push(filters.priority);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { page, limit } = filters.pagination;
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM "support_tickets" t ${where}`,
      values,
    );
    const total = Number.parseInt(countResult.rows[0].total as string, 10);

    const dataResult = await pool.query(
      `SELECT t.*, t."assigned_to",
              (SELECT COUNT(*) FROM "ticket_messages" m WHERE m."ticket_id" = t."id") AS message_count
       FROM "support_tickets" t
       ${where}
       ORDER BY t."updatedAt" DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...values, limit, offset],
    );

    return {
      data: dataResult.rows.map(mapTicketRow),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** Retrieves a ticket with its associated messages by ticket ID. */
  async getTicketById(ticketId: string): Promise<TicketDetailDTO | null> {
    const ticketResult = await pool.query(
      `SELECT *, "assigned_to" FROM "support_tickets" WHERE "id" = $1`,
      [ticketId],
    );

    if (ticketResult.rows.length === 0) return null;

    const ticket = mapTicketRow(ticketResult.rows[0]);

    const messagesResult = await pool.query(
      `SELECT * FROM "ticket_messages" WHERE "ticket_id" = $1 ORDER BY "createdAt" ASC`,
      [ticketId],
    );

    return {
      ...ticket,
      messages: messagesResult.rows.map(mapMessageRow),
    };
  }

  /** Inserts a new message into a ticket and bumps the ticket's updatedAt timestamp. */
  async addMessage(input: AddTicketMessageInput): Promise<TicketMessageDTO> {
    const result = await pool.query(
      `INSERT INTO "ticket_messages" ("ticket_id", "sender_id", "sender_role", "text")
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.ticketId, input.senderId, input.senderRole, input.text],
    );

    // Bump the ticket's updatedAt
    await pool.query(`UPDATE "support_tickets" SET "updatedAt" = NOW() WHERE "id" = $1`, [
      input.ticketId,
    ]);

    return mapMessageRow(result.rows[0]);
  }

  /** Dynamically updates ticket fields (status, priority, assignedTo) and returns the updated record. */
  async updateTicket(input: UpdateTicketInput): Promise<TicketDTO | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (input.status !== undefined) {
      setClauses.push(`"status" = $${idx}`);
      values.push(input.status);
      idx++;
    }

    if (input.priority !== undefined) {
      setClauses.push(`"priority" = $${idx}`);
      values.push(input.priority);
      idx++;
    }

    if (input.assignedTo !== undefined) {
      setClauses.push(`"assigned_to" = $${idx}`);
      values.push(input.assignedTo);
      idx++;
    }

    if (setClauses.length === 0) return null;

    setClauses.push(`"updatedAt" = NOW()`);

    const result = await pool.query(
      `UPDATE "support_tickets"
       SET ${setClauses.join(', ')}
       WHERE "id" = $${idx}
       RETURNING *, "assigned_to"`,
      [...values, input.ticketId],
    );

    if (result.rows.length === 0) return null;
    return mapTicketRow(result.rows[0]);
  }

  /** Checks whether a user is the owner of a given support ticket. */
  async isTicketOwner(ticketId: string, userId: number): Promise<boolean> {
    const result = await pool.query(
      `SELECT 1 FROM "support_tickets" WHERE "id" = $1 AND "userId" = $2`,
      [ticketId, userId],
    );
    return result.rows.length > 0;
  }
}
