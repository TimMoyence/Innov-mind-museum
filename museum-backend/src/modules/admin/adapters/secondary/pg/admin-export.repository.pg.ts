import { User } from '@modules/auth/domain/user/user.entity';
import { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import { Review } from '@modules/review/domain/review/review.entity';
import { SupportTicket } from '@modules/support/domain/ticket/supportTicket.entity';
import { pseudonymise } from '@shared/security/pseudonym';

import type {
  ExportRowReview,
  ExportRowSessions,
  ExportRowTicket,
  ExportSessionsFilter,
} from '@modules/admin/domain/export/csv-export.types';
import type { ExportSessionsRepository } from '@modules/admin/useCase/export/exportChatSessions.useCase';
import type { ExportReviewsRepository } from '@modules/admin/useCase/export/exportReviews.useCase';
import type { ExportTicketsRepository } from '@modules/admin/useCase/export/exportSupportTickets.useCase';
import type { DataSource, Repository } from 'typeorm';

const PSEUDONYM_SALT = 'musaium-admin-export-v1';
const CHUNK_SIZE = 500;

/**
 * PG adapter for the admin CSV export feature (R2 §3.3 / §3.4 / D3 / D4).
 *
 * Implements three streaming methods : sessions / reviews / tickets. Each
 * yields rows one chunk at a time (TypeORM `take + skip` paging) so the HTTP
 * response handler can pipe directly to the wire without buffering the whole
 * result set in memory.
 *
 * Sessions enforces the `WHERE museum_id = $scope` predicate server-side
 * (R6 / D4 defense-in-depth). Reviews + tickets are unscoped at the SQL
 * layer because the corresponding entities lack a `museum_id` column today
 * (Q1 BLOCKER — Appendix A) ; the use case layer prevents non-super_admin
 * roles from reaching the repo.
 */
export class AdminExportRepositoryPg
  implements ExportSessionsRepository, ExportReviewsRepository, ExportTicketsRepository
{
  private readonly sessionRepo: Repository<ChatSession>;
  private readonly reviewRepo: Repository<Review>;
  private readonly ticketRepo: Repository<SupportTicket>;
  private readonly userRepo: Repository<User>;

  constructor(dataSource: DataSource) {
    this.sessionRepo = dataSource.getRepository(ChatSession);
    this.reviewRepo = dataSource.getRepository(Review);
    this.ticketRepo = dataSource.getRepository(SupportTicket);
    this.userRepo = dataSource.getRepository(User);
  }

  /**
   * Streams chat sessions, optionally filtered by museum scope.
   *
   * @param filter - Repo-side scope filter (museum_id WHERE clause or no-op).
   * @yields {ExportRowSessions} One DTO per `chat_sessions` row in chunks of {@link CHUNK_SIZE}.
   */
  async *streamChatSessions(filter: ExportSessionsFilter): AsyncIterable<ExportRowSessions> {
    let skip = 0;
    for (;;) {
      const qb = this.sessionRepo
        .createQueryBuilder('s')
        .leftJoin('s.user', 'u')
        .leftJoin('s.messages', 'm')
        .select([
          's.id AS id',
          "COALESCE(u.id::text, '') AS user_id",
          's.museum_id AS museum_id',
          's.createdAt AS started_at',
          's.updatedAt AS ended_at',
          'COUNT(m.id) AS message_count',
          's.locale AS locale',
        ])
        .groupBy('s.id')
        .addGroupBy('u.id')
        .orderBy('s.createdAt', 'ASC')
        .offset(skip)
        .limit(CHUNK_SIZE);

      if (filter.scopeMuseumId !== null) {
        qb.where('s.museum_id = :scope', { scope: filter.scopeMuseumId });
      }

      const rows = await qb.getRawMany();
      if (rows.length === 0) return;

      for (const row of rows) {
        yield {
          id: row.id,
          user_id: row.user_id,
          museum_id: row.museum_id ?? null,
          started_at: toIso(row.started_at),
          ended_at: row.ended_at ? toIso(row.ended_at) : null,
          message_count: Number(row.message_count),
          locale: row.locale ?? null,
        };
      }

      if (rows.length < CHUNK_SIZE) return;
      skip += CHUNK_SIZE;
    }
  }

  /**
   * Streams reviews (pseudonymising userId before yielding).
   *
   * @yields {ExportRowReview} One DTO per `reviews` row, salted-hash pseudonym.
   */
  async *streamReviews(): AsyncIterable<ExportRowReview> {
    let skip = 0;
    for (;;) {
      const rows = await this.reviewRepo
        .createQueryBuilder('r')
        .orderBy('r.createdAt', 'ASC')
        .skip(skip)
        .take(CHUNK_SIZE)
        .getMany();
      if (rows.length === 0) return;

      for (const row of rows) {
        yield {
          id: row.id,
          user_id_pseudonym: pseudonymise(row.userId, PSEUDONYM_SALT),
          user_name: row.userName,
          rating: row.rating,
          comment: row.comment,
          status: row.status,
          created_at: row.createdAt.toISOString(),
        };
      }

      if (rows.length < CHUNK_SIZE) return;
      skip += CHUNK_SIZE;
    }
  }

  /**
   * Streams support tickets (pseudonymising user email for every role).
   *
   * @yields {ExportRowTicket} One DTO per `support_tickets` row.
   */
  async *streamSupportTickets(): AsyncIterable<ExportRowTicket> {
    let skip = 0;
    for (;;) {
      const rows = await this.ticketRepo
        .createQueryBuilder('t')
        .orderBy('t.createdAt', 'ASC')
        .skip(skip)
        .take(CHUNK_SIZE)
        .getMany();
      if (rows.length === 0) return;

      // Resolve user emails in batch — pseudonymise BEFORE returning so the
      // raw email never leaves this method.
      const userIds = Array.from(new Set(rows.map((r) => r.userId)));
      const users = await this.userRepo
        .createQueryBuilder('u')
        .select(['u.id', 'u.email'])
        .where('u.id IN (:...ids)', { ids: userIds })
        .getMany();
      const emailByUser = new Map<number, string>();
      for (const u of users) {
        emailByUser.set(u.id, u.email);
      }

      for (const row of rows) {
        const email = emailByUser.get(row.userId) ?? String(row.userId);
        yield {
          id: row.id,
          user_email_pseudonym: pseudonymise(email, PSEUDONYM_SALT),
          category: row.category ?? null,
          status: row.status,
          priority: row.priority,
          subject: row.subject,
          assigned_to: row.assignedTo,
          created_at: row.createdAt.toISOString(),
          updated_at: row.updatedAt.toISOString(),
        };
      }

      if (rows.length < CHUNK_SIZE) return;
      skip += CHUNK_SIZE;
    }
  }
}

/** Coerces a Postgres-returned timestamp value to ISO-8601 string. */
function toIso(value: Date | string | null): string {
  if (value === null) return '';
  if (value instanceof Date) return value.toISOString();
  // raw query path returns string ; trust the upstream serialisation.
  return new Date(value).toISOString();
}
