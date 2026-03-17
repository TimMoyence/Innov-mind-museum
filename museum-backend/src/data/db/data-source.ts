import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { User } from '@modules/auth/core/domain/user.entity';
import { AuthRefreshToken } from '@modules/auth/core/domain/authRefreshToken.entity';
import { ArtworkMatch } from '@modules/chat/domain/artworkMatch.entity';
import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/chatSession.entity';
import { env } from '@src/config/env';

const isCompiledRuntime = __filename.endsWith('.js');

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
    ChatSession,
    ChatMessage,
    ArtworkMatch,
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
