// museum-backend/scripts/seed-perf-load.ts
import 'dotenv/config';
import 'reflect-metadata';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppDataSource } from '@data/db/data-source';

interface Checkpoint {
  users: number;
  sessions: number;
  messages: number;
  artworkMatches: number;
}

const CHECKPOINT_PATH = resolve(__dirname, '../.perf-seed-checkpoint.json');
const TARGET = {
  users: 500_000,
  sessions: 1_000_000,
  messages: 10_000_000,
  artworkMatches: 2_000_000,
} as const;
const BATCH = 10_000;

const loadCheckpoint = (): Checkpoint =>
  existsSync(CHECKPOINT_PATH)
    ? (JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf8')) as Checkpoint)
    : { users: 0, sessions: 0, messages: 0, artworkMatches: 0 };

const saveCheckpoint = (cp: Checkpoint): void => {
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp), 'utf8');
};

const guardEnv = (): void => {
  const url = process.env.DATABASE_URL ?? '';
  if (url.includes('rds.amazonaws') || url.includes('staging') || url.includes('prod')) {
    throw new Error('seed-perf-load refuses to run against staging/prod URLs');
  }
};

const seedUsers = async (cp: Checkpoint): Promise<void> => {
  const ds = AppDataSource;
  while (cp.users < TARGET.users) {
    const start = cp.users + 1;
    const end = Math.min(start + BATCH - 1, TARGET.users);
    const values: string[] = [];
    for (let i = start; i <= end; i += 1) {
      values.push(`('perf-${i}@test.local','x','U','${i}')`);
    }
    await ds.query(
      `INSERT INTO "users" ("email","password","firstname","lastname") ` +
        `VALUES ${values.join(',')} ON CONFLICT (email) DO NOTHING`,
    );
    cp.users = end;
    saveCheckpoint(cp);
    if (cp.users % 100_000 === 0) console.log(`users: ${cp.users}/${TARGET.users}`);
  }
};

// Sessions: 90% attached to a user, 10% anonymous. Mean 2 sessions per attached user.
const seedSessions = async (cp: Checkpoint): Promise<void> => {
  const ds = AppDataSource;
  while (cp.sessions < TARGET.sessions) {
    const start = cp.sessions + 1;
    const end = Math.min(start + BATCH - 1, TARGET.sessions);
    const values: string[] = [];
    for (let i = start; i <= end; i += 1) {
      const userId = i % 10 === 0 ? 'NULL' : `${(i % TARGET.users) + 1}`;
      values.push(`(uuid_generate_v4(),'fr',false,${userId},NOW(),NOW(),1)`);
    }
    await ds.query(
      `INSERT INTO "chat_sessions" ` +
        `("id","locale","museumMode","userId","createdAt","updatedAt","version") ` +
        `VALUES ${values.join(',')}`,
    );
    cp.sessions = end;
    saveCheckpoint(cp);
    if (cp.sessions % 100_000 === 0) console.log(`sessions: ${cp.sessions}/${TARGET.sessions}`);
  }
};

const seedMessages = async (cp: Checkpoint): Promise<void> => {
  const ds = AppDataSource;
  // Get session id range — fetched once.
  const sessionIds = (await ds.query(`SELECT id FROM chat_sessions ORDER BY "createdAt" LIMIT $1`, [
    TARGET.sessions,
  ])) as { id: string }[];
  while (cp.messages < TARGET.messages) {
    const start = cp.messages + 1;
    const end = Math.min(start + BATCH - 1, TARGET.messages);
    const values: string[] = [];
    for (let i = start; i <= end; i += 1) {
      const sessionId = sessionIds[i % sessionIds.length].id;
      const role = i % 2 === 0 ? 'user' : 'assistant';
      values.push(`(uuid_generate_v4(),'${sessionId}','${role}','perf message body ${i}',NOW())`);
    }
    await ds.query(
      `INSERT INTO "chat_messages" ("id","sessionId","role","text","createdAt") ` +
        `VALUES ${values.join(',')}`,
    );
    cp.messages = end;
    saveCheckpoint(cp);
    if (cp.messages % 1_000_000 === 0) console.log(`messages: ${cp.messages}/${TARGET.messages}`);
  }
};

const seedArtworkMatches = async (cp: Checkpoint): Promise<void> => {
  const ds = AppDataSource;
  // Source from assistant messages only, sample as we go.
  while (cp.artworkMatches < TARGET.artworkMatches) {
    const start = cp.artworkMatches + 1;
    const end = Math.min(start + BATCH - 1, TARGET.artworkMatches);
    const messageIds = (await ds.query(
      `SELECT id FROM chat_messages WHERE role = 'assistant' OFFSET $1 LIMIT $2`,
      [start, BATCH],
    )) as { id: string }[];
    if (messageIds.length === 0) break;
    const values: string[] = messageIds.map(
      (m) => `(uuid_generate_v4(),'${m.id}','LV-001','Test artwork','Anon',0.9,NOW())`,
    );
    await ds.query(
      `INSERT INTO "artwork_matches" ` +
        `("id","messageId","artworkId","title","artist","confidence","createdAt") ` +
        `VALUES ${values.join(',')}`,
    );
    cp.artworkMatches = Math.min(end, cp.artworkMatches + messageIds.length);
    saveCheckpoint(cp);
    if (cp.artworkMatches % 200_000 === 0) {
      console.log(`artwork_matches: ${cp.artworkMatches}/${TARGET.artworkMatches}`);
    }
  }
};

async function main(): Promise<void> {
  guardEnv();
  await AppDataSource.initialize();
  const cp = loadCheckpoint();
  await seedUsers(cp);
  await seedSessions(cp);
  await seedMessages(cp);
  await seedArtworkMatches(cp);
  await AppDataSource.destroy();
  console.log('seed:perf complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
