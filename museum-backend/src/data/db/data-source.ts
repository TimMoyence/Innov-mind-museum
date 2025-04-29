// src/data/data-source.ts
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import dotenv from 'dotenv';

dotenv.config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.PGDATABASE,
  entities: ['src/modules/**/domain/*.entity.ts'], // Adaptez le chemin si nécessaire
  synchronize: true, // Utilisez true uniquement en développement !
  logging: false,
});
