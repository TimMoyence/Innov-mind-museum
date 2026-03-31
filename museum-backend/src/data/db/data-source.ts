import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { ApiKey } from '@modules/auth/core/domain/apiKey.entity';
import { AuthRefreshToken } from '@modules/auth/core/domain/authRefreshToken.entity';
import { SocialAccount } from '@modules/auth/core/domain/socialAccount.entity';
import { User } from '@modules/auth/core/domain/user.entity';
import { ArtKeyword } from '@modules/chat/domain/artKeyword.entity';
import { ArtworkMatch } from '@modules/chat/domain/artworkMatch.entity';
import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/chatSession.entity';
import { MessageReport } from '@modules/chat/domain/messageReport.entity';
import { UserMemory } from '@modules/chat/domain/userMemory.entity';
import { Museum } from '@modules/museum/core/domain/museum.entity';
import { Review } from '@modules/review/domain/review.entity';
import { SupportTicket } from '@modules/support/domain/supportTicket.entity';
import { TicketMessage } from '@modules/support/domain/ticketMessage.entity';
import { AuditLog } from '@shared/audit/auditLog.entity';
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

const isCompiledRuntime = __filename.endsWith('.js');

if (env.nodeEnv === 'production' && env.dbSynchronize) {
  throw new Error('DB_SYNCHRONIZE must not be true in production — use migrations instead.');
}

/** TypeORM DataSource for PostgreSQL, configured from environment variables. Synchronize is always disabled in production. */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.db.host,
  port: env.db.port,
  username: env.db.user,
  password: env.db.password,
  database: env.db.database,
  entities: [
    User,
    AuthRefreshToken,
    SocialAccount,
    ApiKey,
    ChatSession,
    ChatMessage,
    ArtKeyword,
    ArtworkMatch,
    MessageReport,
    UserMemory,
    AuditLog,
    Museum,
    Review,
    SupportTicket,
    TicketMessage,
  ],
  migrations: isCompiledRuntime
    ? ['dist/src/data/db/migrations/*.js']
    : ['src/data/db/migrations/*.ts'],
  ssl: env.nodeEnv === 'production' ? { rejectUnauthorized: env.dbSsl } : false,
  synchronize: env.nodeEnv === 'production' ? false : env.dbSynchronize,
  logging: false,
  extra: {
    max: env.db.poolMax,
  },
});

/** Logs pool utilization every 60s when pool usage exceeds 80%. */
export function startPoolMonitor(intervalMs = 60_000): NodeJS.Timeout {
  return setInterval(() => {
    if (!AppDataSource.isInitialized) return;
    try {
      const pool = (AppDataSource.driver as any).master;
      if (!pool) return;

      const { totalCount, idleCount, waitingCount } = pool;
      const active = (totalCount as number) - (idleCount as number);
      const utilization = (totalCount as number) > 0 ? active / env.db.poolMax : 0;
      if (utilization >= 0.8) {
        logger.warn('db_pool_high_utilization', {
          active,
          idle: idleCount as number,
          waiting: waitingCount as number,
          max: env.db.poolMax,
          utilization: Math.round(utilization * 100),
        });
      }
    } catch {
      // Pool stats unavailable — skip silently
    }
  }, intervalMs);
}
