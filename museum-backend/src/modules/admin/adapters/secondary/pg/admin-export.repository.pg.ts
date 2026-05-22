import { User } from '@modules/auth/domain/user/user.entity';
import { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import { Review } from '@modules/review/domain/review/review.entity';
import { SupportTicket } from '@modules/support/domain/ticket/supportTicket.entity';
import { pseudonymise } from '@shared/security/pseudonym';
import { env } from '@src/config/env';

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

// I-SEC5 (2026-05-21) — historical literal fallback REMOVED. The committed
// constant was a trivial dictionary-attack surface against the pseudonymised
// export (spec §1.1). The salt now MUST come from `env.exportPseudonymSalt`.
// Prod boot fail-fast lives in `env.production-validation.ts::validateExportPseudonymSalt`.
// Rotation doctrine : `docs/SECURITY.md#export-salt-rotation` — rotation = privacy
// incident only ; post-rotation pseudonyms intentionally non-correlatable with
// pre-rotation outputs (that IS the property we want).
const CHUNK_SIZE = 500;

/**
 * PG adapter for admin CSV export (R2 §3.3/§3.4/D3/D4). Streams in chunks of
 * CHUNK_SIZE via TypeORM `take+skip` — HTTP handler pipes without buffering.
 *
 * Sessions enforces `WHERE museum_id = $scope` server-side (R6/D4 defense-in-depth).
 * Reviews + tickets are SQL-unscoped (Q1 BLOCKER — no `museum_id` column);
 * use case layer prevents non-super_admin from reaching the repo.
 */
export class AdminExportRepositoryPg
  implements ExportSessionsRepository, ExportReviewsRepository, ExportTicketsRepository
{
  private readonly sessionRepo: Repository<ChatSession>;
  private readonly reviewRepo: Repository<Review>;
  private readonly ticketRepo: Repository<SupportTicket>;
  private readonly userRepo: Repository<User>;
  /**
   * I-SEC5 — resolved at construction (not at module-import) so tests that stub
   * env BEFORE constructing the repo keep working. Prod boot fail-fast at
   * `env.production-validation.ts` guarantees this is set before the first
   * request reaches the adapter ; dev defaults to an explicit throw to force
   * the operator to set EXPORT_PSEUDONYM_SALT in their `.env` template.
   */
  private readonly salt: string;

  constructor(dataSource: DataSource) {
    if (!env.exportPseudonymSalt) {
      throw new Error(
        'EXPORT_PSEUDONYM_SALT (env.exportPseudonymSalt) is unset — ' +
          'set it (>= 32 chars) before instantiating AdminExportRepositoryPg. ' +
          'See docs/SECURITY.md#export-salt-rotation.',
      );
    }
    this.salt = env.exportPseudonymSalt;
    this.sessionRepo = dataSource.getRepository(ChatSession);
    this.reviewRepo = dataSource.getRepository(Review);
    this.ticketRepo = dataSource.getRepository(SupportTicket);
    this.userRepo = dataSource.getRepository(User);
  }

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
   * Pseudonymises userId before yielding.
   *
   * @yields {ExportRowReview} pseudonymised review row.
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
          user_id_pseudonym: pseudonymise(row.userId, this.salt),
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
   * Pseudonymises user email for every role (incl. super_admin — R19/D6/Q7).
   *
   * @yields {ExportRowTicket} pseudonymised support ticket row.
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

      // Pseudonymise BEFORE return so raw email never leaves this method.
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
          user_email_pseudonym: pseudonymise(email, this.salt),
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

function toIso(value: Date | string | null): string {
  if (value === null) return '';
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}
