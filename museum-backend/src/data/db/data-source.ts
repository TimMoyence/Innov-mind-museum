import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { ApiKey } from '@modules/auth/domain/api-key/apiKey.entity';
import { UserConsent } from '@modules/auth/domain/consent/userConsent.entity';
import { AuthRefreshToken } from '@modules/auth/domain/refresh-token/authRefreshToken.entity';
import { SocialAccount } from '@modules/auth/domain/social-account/socialAccount.entity';
import { TotpSecret } from '@modules/auth/domain/totp/totp-secret.entity';
import { User } from '@modules/auth/domain/user/user.entity';
import { ArtKeyword } from '@modules/chat/domain/art-keyword/artKeyword.entity';
import { ArtworkMatch } from '@modules/chat/domain/art-keyword/artworkMatch.entity';
import { UserMemory } from '@modules/chat/domain/memory/userMemory.entity';
import { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import { MessageFeedback } from '@modules/chat/domain/message/messageFeedback.entity';
import { MessageReport } from '@modules/chat/domain/message/messageReport.entity';
import { ChatSession } from '@modules/chat/domain/session/chatSession.entity';
import { ArtworkKnowledge } from '@modules/knowledge-extraction/domain/artwork-knowledge/artwork-knowledge.entity';
import { ExtractedContent } from '@modules/knowledge-extraction/domain/extracted-content/extracted-content.entity';
import { MuseumEnrichment } from '@modules/knowledge-extraction/domain/museum-enrichment/museum-enrichment.entity';
import { Museum } from '@modules/museum/domain/museum/museum.entity';
import { MuseumQaSeed } from '@modules/museum/domain/qa-seed/museumQaSeed.entity';
import { Review } from '@modules/review/domain/review/review.entity';
import { SupportTicket } from '@modules/support/domain/ticket/supportTicket.entity';
import { TicketMessage } from '@modules/support/domain/ticket/ticketMessage.entity';
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
    UserConsent,
    AuthRefreshToken,
    SocialAccount,
    TotpSecret,
    ApiKey,
    ChatSession,
    ChatMessage,
    ArtKeyword,
    ArtworkMatch,
    MessageFeedback,
    MessageReport,
    UserMemory,
    AuditLog,
    Museum,
    MuseumQaSeed,
    Review,
    SupportTicket,
    TicketMessage,
    ExtractedContent,
    ArtworkKnowledge,
    MuseumEnrichment,
  ],
  migrations: isCompiledRuntime
    ? ['dist/src/data/db/migrations/*.js']
    : ['src/data/db/migrations/*.ts'],
  ssl:
    env.nodeEnv === 'production' && env.dbSsl
      ? { rejectUnauthorized: env.dbSslRejectUnauthorized }
      : false,
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
      const driver = AppDataSource.driver as unknown as {
        master?: { totalCount: number; idleCount: number; waitingCount: number };
      };
      const pool = driver.master;
      if (!pool) return;

      const { totalCount, idleCount, waitingCount } = pool;
      const active = totalCount - idleCount;
      const utilization = totalCount > 0 ? active / env.db.poolMax : 0;
      if (utilization >= 0.8) {
        logger.warn('db_pool_high_utilization', {
          active,
          idle: idleCount,
          waiting: waitingCount,
          max: env.db.poolMax,
          utilization: Math.round(utilization * 100),
        });
      }
    } catch {
      // Pool stats unavailable — skip silently
    }
  }, intervalMs);
}
