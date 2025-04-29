// ormconfig.js

module.exports = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.PGDATABASE,
  entities: ['src/modules/**/domain/*.entity.ts'], // Ajustez le chemin si nécessaire
  synchronize: true, // Utilisez true en développement, attention en production !
  logging: false,
};
