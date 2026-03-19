import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { User } from '@modules/auth/core/domain/user.entity';
import { AuthRefreshToken } from '@modules/auth/core/domain/authRefreshToken.entity';
import { SocialAccount } from '@modules/auth/core/domain/socialAccount.entity';
import { ApiKey } from '@modules/auth/core/domain/apiKey.entity';
import { ArtworkMatch } from '@modules/chat/domain/artworkMatch.entity';
import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/chatSession.entity';
import { MessageReport } from '@modules/chat/domain/messageReport.entity';
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
    ArtworkMatch,
    MessageReport,
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
