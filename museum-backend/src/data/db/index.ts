import { Pool } from 'pg';

const pool = new Pool({
  database: process.env.PGDATABASE ,
  port: Number(process.env.DB_PORT) || 5432,
});

export default pool;
