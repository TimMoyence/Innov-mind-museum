import dotenv from 'dotenv';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from '@modules/auth/core/domain/user.entity';
import { ImageInsightConversation } from '@IA/imageInsight/core/domain/imageInsightConversation.entity';
import { ImageInsightMessage } from '@modules/IA/imageInsight/core/domain/imageInsightMessage.entity';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  database: process.env.PGDATABASE,
  entities: [User, ImageInsightConversation, ImageInsightMessage],
  synchronize: true, // ⚠️ Only true in dev
  logging: false,
});
