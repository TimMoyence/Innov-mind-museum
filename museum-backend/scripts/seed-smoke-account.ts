import 'dotenv/config';
import 'reflect-metadata';

import crypto from 'node:crypto';

import bcrypt from 'bcrypt';
import { IsNull } from 'typeorm';

import { AppDataSource } from '@data/db/data-source';
import { CONSENT_SCOPES, UserConsent } from '@modules/auth/domain/consent/userConsent.entity';
import { User } from '@modules/auth/domain/user/user.entity';
import { BCRYPT_ROUNDS } from '@shared/security/bcrypt';

import type { ConsentScope } from '@modules/auth/domain/consent/userConsent.entity';
import type { DataSource } from 'typeorm';

export const SMOKE_CONSENT_SCOPES: readonly ConsentScope[] = [
  'third_party_ai_text_openai',
  'third_party_ai_audio_openai',
];

const SMOKE_CONSENT_VERSION = '1.0';
const SMOKE_CONSENT_SOURCE = 'registration';

const SMOKE_PASSWORD_TRANSIT_PREFIX = 'SMOKE_TEST_PASSWORD=';

export function formatSmokeCreatePasswordLine(password: string): string {
  return `${SMOKE_PASSWORD_TRANSIT_PREFIX}${password}`;
}

export async function ensureSmokeConsents(
  dataSource: DataSource,
  userId: number,
): Promise<{ created: ConsentScope[]; alreadyActive: ConsentScope[] }> {
  const repo = dataSource.getRepository(UserConsent);
  const created: ConsentScope[] = [];
  const alreadyActive: ConsentScope[] = [];

  for (const scope of SMOKE_CONSENT_SCOPES) {
    const existing = await repo.findOne({
      where: { userId, scope, revokedAt: IsNull() },
    });
    if (existing) {
      alreadyActive.push(scope);
      continue;
    }
    const now = new Date();
    await repo.insert({
      userId,
      scope,
      version: SMOKE_CONSENT_VERSION,
      grantedAt: now,
      revokedAt: null,
      source: SMOKE_CONSENT_SOURCE,
    });
    created.push(scope);
  }
  return { created, alreadyActive };
}

async function hardDeleteUserById(dataSource: DataSource, userId: number): Promise<void> {
  await dataSource.transaction(async (manager) => {
    await manager
      .createQueryBuilder()
      .delete()
      .from('chat_sessions')
      .where('"userId" = :userId', { userId })
      .execute();
    await manager
      .createQueryBuilder()
      .delete()
      .from(User)
      .where('id = :userId', { userId })
      .execute();
  });
}

export async function createSmokeAccount(
  dataSource: DataSource,
  args: { email: string },
): Promise<{
  userId: number;
  createdUser: boolean;
  password: string;
  consents: Awaited<ReturnType<typeof ensureSmokeConsents>>;
}> {
  const { email } = args;
  const repo = dataSource.getRepository(User);

  const password = crypto.randomBytes(24).toString('base64url');

  const existing = await repo.findOne({ where: { email } });
  if (existing) {
    await hardDeleteUserById(dataSource, existing.id);
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const now = new Date();

  const inserted = await repo.insert({
    email,
    password: passwordHash,
    firstname: 'Smoke',
    lastname: 'Test',
    role: 'visitor',
    email_verified: true,
    onboarding_completed: true,
    createdAt: now,
    updatedAt: now,
  });
  const insertedId = inserted.identifiers[0]?.id;
  if (typeof insertedId !== 'number') {
    throw new Error(
      `seed-smoke-account: inserted user has no numeric id (identifiers=${JSON.stringify(inserted.identifiers)})`,
    );
  }
  const userId = insertedId;

  const consents = await ensureSmokeConsents(dataSource, userId);
  return { userId, createdUser: true, password, consents };
}

export async function cleanupSmokeAccount(
  dataSource: DataSource,
  args: { email: string },
): Promise<{ deleted: boolean; userId?: number }> {
  const { email } = args;
  const repo = dataSource.getRepository(User);
  const existing = await repo.findOne({ where: { email } });
  if (!existing) {
    return { deleted: false };
  }
  await hardDeleteUserById(dataSource, existing.id);
  return { deleted: true, userId: existing.id };
}

for (const scope of SMOKE_CONSENT_SCOPES) {
  if (!(CONSENT_SCOPES as readonly string[]).includes(scope)) {
    throw new Error(
      `seed-smoke-account: SMOKE_CONSENT_SCOPES references "${scope}" which is no longer in CONSENT_SCOPES`,
    );
  }
}

type SmokeVerb = 'create' | 'cleanup';

function parseVerb(argv: readonly string[]): SmokeVerb | null {
  const verb = argv[2]?.trim();
  return verb === 'create' || verb === 'cleanup' ? verb : null;
}

async function runCreate(email: string): Promise<void> {
  await AppDataSource.initialize();
  try {
    const { userId, password, consents } = await createSmokeAccount(AppDataSource, { email });
    console.error(
      `[seed-smoke-account] create OK id=${userId} ` +
        `consents created=[${consents.created.join(',')}] already-active=[${consents.alreadyActive.join(',')}]`,
    );
    console.log(formatSmokeCreatePasswordLine(password));
  } finally {
    await AppDataSource.destroy();
  }
}

async function runCleanup(email: string): Promise<void> {
  await AppDataSource.initialize();
  try {
    const { deleted, userId } = await cleanupSmokeAccount(AppDataSource, { email });
    console.error(
      `[seed-smoke-account] cleanup OK id=${userId ?? 'none'} deleted=${String(deleted)}`,
    );
  } finally {
    await AppDataSource.destroy();
  }
}

async function main(): Promise<void> {
  const verb = parseVerb(process.argv);
  if (!verb) {
    console.error('seed-smoke-account: usage — seed-smoke-account.js <create|cleanup>');
    process.exit(1);
  }

  const email = process.env.SMOKE_TEST_EMAIL?.trim();
  if (!email) {
    console.error('seed-smoke-account: SMOKE_TEST_EMAIL absent — skipping.');
    process.exit(0);
  }

  if (verb === 'create') {
    await runCreate(email);
  } else {
    await runCleanup(email);
  }
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('seed-smoke-account failed:', err);
    process.exit(1);
  });
}
