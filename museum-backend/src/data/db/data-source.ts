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
import { env } from '@src/config/env';

const isCompiledRuntime = __filename.endsWith('.js');

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
  synchronize: env.nodeEnv === 'production' ? false : env.dbSynchronize,
  logging: false,
  extra: {
    max: env.db.poolMax,
  },
});
