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

/**
 * EPHEMERAL smoke-test account lifecycle (cycle C, run
 * 2026-05-26-auth-mfa-rgpd-zerodefect).
 *
 * Two CLI subcommands, dispatched on `process.argv[2]`:
 *   - `create`  : insert a FRESH user with a per-run RANDOM password
 *                 (`email_verified=true`, `role='visitor'`,
 *                 `onboarding_completed=true`) + active consents, then emit the
 *                 random password on a single machine-readable transit line for
 *                 the deploy workflow to capture (masked). NO update/heal branch
 *                 — if a same-email residue exists (crashed prior run) it is
 *                 hard-deleted first, then re-inserted.
 *   - `cleanup` : idempotent HARD-delete of the smoke user AND all its children
 *                 (two-step delete mirroring `user.repository.pg.ts` deleteUser),
 *                 so NO connectable account survives a deploy.
 *
 * Runs AFTER migrations + app-level seeds. The deploy workflow wires it as
 * `create` → smoke login (`smoke-api.cjs`) → `cleanup` (in `always()`), so the
 * smoke account exists only for the few seconds of the smoke test. There is no
 * resident/self-healing account anymore (the old permanent upsert + its silent
 * `verification_token: undefined` TypeORM no-op are gone).
 *
 * The consent grant (added 2026-05-23) closes the GDPR consent-gate loop shipped
 * in PR #294 — without active `third_party_ai_*` consents the chat service
 * early-returns a synthetic `consent_refusal::<scope>` id (not a UUID) and every
 * smoke flow rejects downstream:
 *   - prod smoke (smoke-api.cjs)         → TTS isUuid validator → 400
 *   - llm-promptfoo-smoke daily cron     → recall=0/10
 *   - llm-security-promptfoo weekly cron → adversarial corpus fails on a baseline
 *                                          refusal instead of the guardrail
 * Granting at `create` time covers all those workflows from one place.
 */

/**
 * Scopes a smoke user MUST hold to exercise the happy-path chat → TTS chain.
 *
 * `third_party_ai_text_openai` → chat POST text path (consent-gate.ts:73 +
 * provider-resolver.ts text channel → openai).
 *
 * `third_party_ai_audio_openai` → TTS round-trip via openai (text-to-speech.
 * openai.ts:46 uses the Opus audio codec ; the consent gate may extend to
 * audio in V1.x — pre-granting is cheap belt-and-suspenders).
 *
 * Compile-time pin via `ConsentScope` keeps this in sync if the registry
 * ever drops a scope — would fail tsc until updated.
 */
export const SMOKE_CONSENT_SCOPES: readonly ConsentScope[] = [
  'third_party_ai_text_openai',
  'third_party_ai_audio_openai',
];

const SMOKE_CONSENT_VERSION = '1.0';
const SMOKE_CONSENT_SOURCE = 'registration';

/**
 * Prefix of the single machine-readable line the `create` path prints so the
 * deploy workflow can capture the per-run random password (D2). The value is
 * masked (`::add-mask::`) by the workflow before any downstream use.
 */
const SMOKE_PASSWORD_TRANSIT_PREFIX = 'SMOKE_TEST_PASSWORD=';

/**
 * Format the single machine-readable transit line carrying the per-run random
 * password (R3 / design §9 D2): `SMOKE_TEST_PASSWORD=<value>`. This is the ONLY
 * place the password is printed; the workflow `::add-mask::`s it immediately.
 *
 * Exported so the unit test can lock the exact contract without driving a DB.
 */
export function formatSmokeCreatePasswordLine(password: string): string {
  return `${SMOKE_PASSWORD_TRANSIT_PREFIX}${password}`;
}

/**
 * Ensures `user_consents` has an ACTIVE row (`revoked_at IS NULL`) for each
 * scope in {@link SMOKE_CONSENT_SCOPES}. The table is append-only by design
 * (`revoked_at` flips to a timestamp on revoke, never deletes), so we mirror
 * that by inserting only when there is no active row. Safe to re-run.
 *
 * Exported for the integration specs under
 * `tests/integration/scripts/seed-smoke-account.*.spec.ts`.
 *
 * @returns The per-scope outcome :
 *  - `created` : scopes for which a new active row was inserted this call.
 *  - `alreadyActive` : scopes that already had an active row (no-op).
 */
export async function ensureSmokeConsents(
  dataSource: DataSource,
  userId: number,
): Promise<{ created: ConsentScope[]; alreadyActive: ConsentScope[] }> {
  const repo = dataSource.getRepository(UserConsent);
  const created: ConsentScope[] = [];
  const alreadyActive: ConsentScope[] = [];

  for (const scope of SMOKE_CONSENT_SCOPES) {
    // `IsNull()` MUST be used instead of `revokedAt: null` literal —
    // TypeORM 0.3.x quietly drops nullable-column filters when the value is
    // a JS `null` (treats it as "no filter on this column"), so a literal
    // `null` would match BOTH active AND revoked rows. `IsNull()` forces
    // SQL `revoked_at IS NULL`. Without this, a smoke user whose consent
    // was revoked once would never get a re-grant on the next seed run.
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

/**
 * Two-step transactional HARD-delete of a user by id, mirroring the canonical
 * `user.repository.pg.ts` `deleteUser` (lines 220-236).
 *
 * Step 1 deletes `chat_sessions` for the user FIRST (and lets their own FK
 * cascade take messages / artwork_matches / message_reports) because the
 * runtime `chat_sessions.userId → users` FK is `ON DELETE SET NULL`
 * (migration 1772000000001-FixChatSessionsUserFk): a direct user delete would
 * NULL the sessions and leave orphan rows rather than removing them. Step 2
 * deletes the `users` row, whose `ON DELETE CASCADE` children
 * (auth_refresh_tokens, user_consents, social_accounts, api_keys, totp_secrets,
 * …) go with it. Wrapped in one transaction so a mid-delete failure rolls back.
 */
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

/**
 * `create` — insert a FRESH smoke user with a per-run RANDOM password + active
 * consents (R1/R2/R8). NO update/heal branch: any same-email residue from a
 * crashed prior run is hard-deleted first, then a fresh row is inserted (R2 /
 * design §9 D6). This is the single place the old `field: undefined` no-op would
 * have lived — now structurally impossible (delete-then-insert).
 *
 * Exported so the integration specs can drive it against a testcontainer.
 *
 * @returns `{ userId, createdUser, password, consents }`. `password` is the
 *   plaintext random secret the workflow carries to the smoke step (the stored
 *   column is the bcrypt hash, never the plaintext).
 */
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

  // 24 random bytes → 32-char URL-safe string (≥ 192 bits entropy). NEVER
  // hardcoded, NEVER committed; emitted once on the transit line for the
  // workflow to capture + mask.
  const password = crypto.randomBytes(24).toString('base64url');

  // R2 / D6 — guarantee freshness: a residual same-email row (crashed prior
  // run) is hard-deleted before insert. No upsert/heal path exists.
  const existing = await repo.findOne({ where: { email } });
  if (existing) {
    await hardDeleteUserById(dataSource, existing.id);
  }

  // TD-BC-03 — central BCRYPT_ROUNDS instead of a hardcoded literal to avoid
  // drift on the next cost bump.
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

/**
 * `cleanup` — idempotent HARD-delete of the smoke user by email (R4). Resolves
 * the user first; absent → `{ deleted: false }` (no error, idempotent). Present
 * → two-step transactional delete (see {@link hardDeleteUserById}) so neither
 * the user nor any orphan `chat_sessions` row survives.
 *
 * Exported for the integration specs.
 */
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

// Sanity: `ConsentScope` is a closed union, but a quick runtime check on
// CONSENT_SCOPES keeps the registry honest if anyone ever drops a scope from
// the canonical list while leaving it referenced here.
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
    // Ops log → stderr so it never pollutes the stdout transit channel and
    // never carries the password (only the structured outcome).
    console.error(
      `[seed-smoke-account] create OK id=${userId} ` +
        `consents created=[${consents.created.join(',')}] already-active=[${consents.alreadyActive.join(',')}]`,
    );
    // R3 — the ONLY line carrying the password, on stdout, machine-readable.
    // The deploy workflow captures it, `::add-mask::`s the value, and forwards
    // it to the smoke step env. NEVER logged in clear anywhere else.
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
    // R5 — preserve the non-prod skip: no email → no-op exit 0, no DB connection.
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

// Guard the CLI entrypoint so `require('./seed-smoke-account')` from a test
// does NOT auto-execute main() (mirrors seed-museums.ts pattern).
if (require.main === module) {
  main().catch((err) => {
    console.error('seed-smoke-account failed:', err);
    process.exit(1);
  });
}
