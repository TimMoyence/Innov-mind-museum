import { Pool } from 'pg';

import { env } from '@src/config/env';

const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  max: env.db.poolMax,
});

export default pool;
