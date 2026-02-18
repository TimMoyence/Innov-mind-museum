import 'reflect-metadata';
import { DataSource } from 'typeorm';

import { ImageInsightConversation } from '@IA/imageInsight/core/domain/imageInsightConversation.entity';
import { User } from '@modules/auth/core/domain/user.entity';
import { ArtworkMatch } from '@modules/chat/domain/artworkMatch.entity';
import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import { ChatSession } from '@modules/chat/domain/chatSession.entity';
import { ImageInsightMessage } from '@modules/IA/imageInsight/core/domain/imageInsightMessage.entity';
import { env } from '@src/config/env';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.db.host,
  port: env.db.port,
  username: env.db.user,
  password: env.db.password,
  database: env.db.database,
  entities: [
    User,
    ImageInsightConversation,
    ImageInsightMessage,
    ChatSession,
    ChatMessage,
    ArtworkMatch,
  ],
  migrations: [
    'src/data/db/migrations/*.ts',
    'dist/src/data/db/migrations/*.js',
  ],
  synchronize: env.dbSynchronize,
  logging: false,
  extra: {
    max: env.db.poolMax,
  },
});
