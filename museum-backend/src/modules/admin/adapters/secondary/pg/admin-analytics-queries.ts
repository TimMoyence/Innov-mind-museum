import { ArtworkMatch } from '@modules/chat/domain/artworkMatch.entity';
import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/chatSession.entity';

import type {
  UsageAnalytics,
  UsageAnalyticsFilters,
  ContentAnalytics,
  ContentAnalyticsFilters,
  EngagementAnalytics,
  EngagementAnalyticsFilters,
  AnalyticsGranularity,
} from '../../../domain/admin/admin.types';
import type { AuditLog } from '@shared/audit/auditLog.entity';
import type { DataSource, Repository } from 'typeorm';

/**
 * Map a granularity string to a PostgreSQL date_trunc unit.
 *
 * Defense-in-depth against SQL template-literal injection (finding M7/H-2):
 * the HTTP layer validates `granularity` with a Zod enum, but if that guard
 * is ever bypassed (direct internal caller, future regression), this runtime
 * `default` throws rather than silently returning `undefined` which would
 * inject `"undefined"` into the `date_trunc()` call.
 */
function granularityToTrunc(g: AnalyticsGranularity): string {
  switch (g) {
    case 'daily':
      return 'day';
    case 'weekly':
      return 'week';
    case 'monthly':
      return 'month';
    default: {
      const _exhaustive: never = g;
      throw new Error(`unreachable granularity: ${String(_exhaustive)}`);
    }
  }
}

/** Repository bundle passed to analytics query functions. */
interface AnalyticsRepositories {
  dataSource: DataSource;
  sessionRepo: Repository<ChatSession>;
  messageRepo: Repository<ChatMessage>;
  auditRepo: Repository<AuditLog>;
}

/** Computes time-series usage analytics (sessions, messages, active users) for a date range. */
export async function queryUsageAnalytics(
  repos: AnalyticsRepositories,
  filters: UsageAnalyticsFilters,
): Promise<UsageAnalytics> {
  const granularity: AnalyticsGranularity = filters.granularity ?? 'daily';
  const trunc = granularityToTrunc(granularity);
  const days = filters.days ?? 30;

  // Build date filter conditions and parameters.
  // The fallback cutoff is precomputed in JS to avoid interpolating `days`
  // into an SQL INTERVAL string (prevents SQL-injection via numeric input).
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const buildDateFilter = (
    alias: string,
  ): { conditions: string[]; params: Record<string, unknown> } => {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (filters.from) {
      conditions.push(`${alias}."createdAt" >= :from`);
      params.from = filters.from;
    } else {
      conditions.push(`${alias}."createdAt" >= :cutoff`);
      params.cutoff = cutoff.toISOString();
    }
    if (filters.to) {
      conditions.push(`${alias}."createdAt" <= :to`);
      params.to = filters.to;
    }
    return { conditions, params };
  };

  const sessionFilter = buildDateFilter('session');
  const messageFilter = buildDateFilter('message');
  const activeFilter = buildDateFilter('session');

  // SAFETY: `trunc` is derived from `granularityToTrunc()` which maps the
  // TypeScript union `AnalyticsGranularity` ('daily'|'weekly'|'monthly') to
  // a fixed set of literals ('day'|'week'|'month'). It never contains user input.
  const [sessionsResult, messagesResult, activeUsersResult] = await Promise.all([
    repos.sessionRepo
      .createQueryBuilder('session')
      .select(`date_trunc('${trunc}', session."createdAt")`, 'd')
      .addSelect('COUNT(*)', 'c')
      .where(sessionFilter.conditions.join(' AND '), sessionFilter.params)
      .groupBy('d')
      .orderBy('d')
      .getRawMany<{ d: Date; c: string }>(),
    repos.messageRepo
      .createQueryBuilder('message')
      .select(`date_trunc('${trunc}', message."createdAt")`, 'd')
      .addSelect('COUNT(*)', 'c')
      .where(messageFilter.conditions.join(' AND '), messageFilter.params)
      .groupBy('d')
      .orderBy('d')
      .getRawMany<{ d: Date; c: string }>(),
    repos.sessionRepo
      .createQueryBuilder('session')
      .select(`date_trunc('${trunc}', session."createdAt")`, 'd')
      .addSelect('COUNT(DISTINCT session."userId")', 'c')
      .where(
        activeFilter.conditions.join(' AND ') + ' AND session."userId" IS NOT NULL',
        activeFilter.params,
      )
      .groupBy('d')
      .orderBy('d')
      .getRawMany<{ d: Date; c: string }>(),
  ]);

  const mapTs = (rows: { d: Date; c: string }[]) =>
    rows.map((r) => ({
      date: new Date(r.d).toISOString().slice(0, 10),
      count: Number.parseInt(r.c, 10),
    }));

  return {
    period: {
      from: filters.from ?? new Date(Date.now() - days * 86400000).toISOString().slice(0, 10),
      to: filters.to ?? new Date().toISOString().slice(0, 10),
    },
    granularity,
    sessionsCreated: mapTs(sessionsResult),
    messagesSent: mapTs(messagesResult),
    activeUsers: mapTs(activeUsersResult),
  };
}

/** Computes content analytics including top artworks, museums, and guardrail block rate. */
export async function queryContentAnalytics(
  repos: AnalyticsRepositories,
  filters: ContentAnalyticsFilters,
): Promise<ContentAnalytics> {
  const topN = filters.limit ?? 10;

  // Build date filter for artwork_matches and chat_sessions
  const artworkQb = repos.dataSource
    .getRepository(ArtworkMatch)
    .createQueryBuilder('a')
    .select('a.title', 'title')
    .addSelect('a.artist', 'artist')
    .addSelect('COUNT(*)', 'c')
    .groupBy('a.title')
    .addGroupBy('a.artist')
    .orderBy('c', 'DESC')
    .limit(topN);

  if (filters.from) {
    artworkQb.andWhere('a.createdAt >= :from', { from: filters.from });
  }
  if (filters.to) {
    artworkQb.andWhere('a.createdAt <= :to', { to: filters.to });
  }

  const museumQb = repos.sessionRepo
    .createQueryBuilder('session')
    .select('session.museumName', 'name')
    .addSelect('COUNT(*)', 'c')
    .where('session.museumName IS NOT NULL')
    .groupBy('session.museumName')
    .orderBy('c', 'DESC')
    .limit(topN);

  if (filters.from) {
    museumQb.andWhere('session.createdAt >= :from', { from: filters.from });
  }
  if (filters.to) {
    museumQb.andWhere('session.createdAt <= :to', { to: filters.to });
  }

  const guardrailPromise = (async () => {
    const totalQb = repos.auditRepo.createQueryBuilder('log').select('COUNT(*)', 'total');
    if (filters.from) {
      totalQb.andWhere('log.createdAt >= :from', { from: filters.from });
    }
    if (filters.to) {
      totalQb.andWhere('log.createdAt <= :to', { to: filters.to });
    }

    const blockedQb = repos.auditRepo
      .createQueryBuilder('log')
      .select('COUNT(*)', 'total')
      .where("log.action = 'SECURITY_GUARDRAIL_BLOCK'");
    if (filters.from) {
      blockedQb.andWhere('log.createdAt >= :from', { from: filters.from });
    }
    if (filters.to) {
      blockedQb.andWhere('log.createdAt <= :to', { to: filters.to });
    }

    const [totalRes, blockedRes] = await Promise.all([
      totalQb.getRawOne<{ total: string }>(),
      blockedQb.getRawOne<{ total: string }>(),
    ]);

    const total = Number.parseInt(totalRes?.total ?? '0', 10);
    const blocked = Number.parseInt(blockedRes?.total ?? '0', 10);
    return total > 0 ? blocked / total : 0;
  })();

  const [artworksResult, museumsResult, guardrailResult] = await Promise.all([
    artworkQb.getRawMany<{ title: string | null; artist: string | null; c: string }>(),
    museumQb.getRawMany<{ name: string; c: string }>(),
    guardrailPromise,
  ]);

  return {
    topArtworks: artworksResult.map((r) => ({
      title: r.title ?? 'Unknown',
      artist: r.artist ?? null,
      count: Number.parseInt(r.c, 10),
    })),
    topMuseums: museumsResult.map((r) => ({
      name: r.name,
      count: Number.parseInt(r.c, 10),
    })),
    guardrailBlockRate: guardrailResult,
  };
}

const addDateFilters = (
  qb: { andWhere: (condition: string, params: Record<string, unknown>) => unknown },
  alias: string,
  filters: { from?: string; to?: string },
): void => {
  if (filters.from) {
    qb.andWhere(`${alias}."createdAt" >= :from`, { from: filters.from });
  }
  if (filters.to) {
    qb.andWhere(`${alias}."createdAt" <= :to`, { to: filters.to });
  }
};

/** Computes engagement metrics including average messages, session duration, and return rate. */
export async function queryEngagementAnalytics(
  repos: AnalyticsRepositories,
  filters: EngagementAnalyticsFilters,
): Promise<EngagementAnalytics> {
  // Average messages per session
  const avgMsgQb = repos.sessionRepo
    .createQueryBuilder('s')
    .select('COALESCE(AVG(sub.msg_count), 0)', 'avg_msg')
    .from((subQuery) => {
      const sq = subQuery
        .select('s.id', 'id')
        .addSelect('COUNT(m.id)', 'msg_count')
        .from(ChatSession, 's')
        .leftJoin(ChatMessage, 'm', 'm."sessionId" = s.id')
        .groupBy('s.id');
      if (filters.from) {
        sq.andWhere('s."createdAt" >= :from', { from: filters.from });
      }
      if (filters.to) {
        sq.andWhere('s."createdAt" <= :to', { to: filters.to });
      }
      return sq;
    }, 'sub');

  // Average session duration in minutes
  const avgDurationQb = repos.sessionRepo
    .createQueryBuilder('s')
    .select(
      'COALESCE(AVG(EXTRACT(EPOCH FROM (s."updatedAt" - s."createdAt")) / 60), 0)',
      'avg_dur',
    );
  addDateFilters(avgDurationQb, 's', filters);

  // Return rate: unique users vs returning users
  const returnRateMainQb = repos.sessionRepo
    .createQueryBuilder('s')
    .select('COUNT(DISTINCT s."userId")', 'total_unique')
    .where('s."userId" IS NOT NULL');
  addDateFilters(returnRateMainQb, 's', filters);

  // Build the returning users subquery as raw SQL to avoid complexity
  const returningParams: unknown[] = [];
  let returningWhere = '';
  if (filters.from) {
    returningParams.push(filters.from);
    returningWhere += ` AND sub."createdAt" >= $${returningParams.length}`;
  }
  if (filters.to) {
    returningParams.push(filters.to);
    returningWhere += ` AND sub."createdAt" <= $${returningParams.length}`;
  }

  const [avgMsgResult, avgDurationResult, totalUniqueResult, returningResult] = await Promise.all([
    avgMsgQb.getRawOne<{ avg_msg: string }>(),
    avgDurationQb.getRawOne<{ avg_dur: string }>(),
    returnRateMainQb.getRawOne<{ total_unique: string }>(),
    repos.dataSource.query(
      `SELECT COUNT(*) AS returning_users FROM (
           SELECT sub."userId"
           FROM "chat_sessions" sub
           WHERE sub."userId" IS NOT NULL${returningWhere}
           GROUP BY sub."userId"
           HAVING COUNT(*) > 1
         ) t`,
      returningParams,
    ),
  ]);

  const totalUniqueUsers = Number.parseInt(totalUniqueResult?.total_unique ?? '0', 10);
  const returningUsers = Number.parseInt(returningResult[0]?.returning_users ?? '0', 10);

  return {
    avgMessagesPerSession: Number.parseFloat(avgMsgResult?.avg_msg ?? '0') || 0,
    avgSessionDurationMinutes: Number.parseFloat(avgDurationResult?.avg_dur ?? '0') || 0,
    returnUserRate: totalUniqueUsers > 0 ? returningUsers / totalUniqueUsers : 0,
    totalUniqueUsers,
    returningUsers,
  };
}
