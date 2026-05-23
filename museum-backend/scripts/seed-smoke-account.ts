import 'dotenv/config';
import 'reflect-metadata';

import bcrypt from 'bcrypt';
import { IsNull } from 'typeorm';

import { AppDataSource } from '@data/db/data-source';
import { CONSENT_SCOPES, UserConsent } from '@modules/auth/domain/consent/userConsent.entity';
import { User } from '@modules/auth/domain/user/user.entity';
import { BCRYPT_ROUNDS } from '@shared/security/bcrypt';

import type { ConsentScope } from '@modules/auth/domain/consent/userConsent.entity';
import type { DataSource } from 'typeorm';

/**
 * Idempotent seed for the post-deploy smoke-test account.
 *
 * Reads SMOKE_TEST_EMAIL + SMOKE_TEST_PASSWORD from env (same vars used by
 * scripts/smoke-api.cjs), ensures the row exists with:
 *   - password hash matching the current secret,
 *   - email_verified = true (post-deploy smoke must login with zero manual
 *     setup; also insulates against future verification_token TTL drifts),
 *   - role = 'visitor' (principle of least privilege; smoke only hits public
 *     endpoints),
 *   - no onboarding gates (onboarding_completed = true),
 *   - active grants for every scope in {@link SMOKE_CONSENT_SCOPES} (the
 *     consent-gate.ts:73 refuses chat otherwise — see rationale below).
 *
 * Runs AFTER migrations + app-level seeds, BEFORE smoke-api.cjs, on every prod
 * deploy. Also drives the `seed:smoke-account` step of llm-promptfoo-smoke /
 * llm-security-promptfoo CI workflows. Safe to re-run: only updates the
 * fields above; preserves user.id and created_at so audit history + FK
 * references remain stable.
 *
 * Rationale: previously the smoke account drifted out of sync with prod (email
 * unverified after a security sprint hardened login with email_verified gate).
 * The auto-rollback saved the deploy but blocked CI. This script closes the
 * loop so prod deploy is self-healing on smoke credentials. The consent grant
 * step added 2026-05-23 closes the same loop for the GDPR consent gate
 * shipped in PR #294 — without it `seed-smoke-account` users hit
 * `consent-gate.ts:73`, the chat service early-returns a synthetic
 * `consent_refusal::<scope>` id (not a UUID), and every smoke flow rejects
 * downstream :
 *   - prod smoke (smoke-api.cjs)         → TTS isUuid validator → 400
 *   - llm-promptfoo-smoke daily cron     → recall=0/10 (refusal text never
 *                                          matches expected art content)
 *   - llm-security-promptfoo weekly cron → adversarial corpus fails on a
 *                                          baseline refusal instead of the
 *                                          guardrail under test
 * Granting at SEED time covers all three workflows from one place.
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
 * Ensures `user_consents` has an ACTIVE row (`revoked_at IS NULL`) for each
 * scope in {@link SMOKE_CONSENT_SCOPES}. The table is append-only by design
 * (`revoked_at` flips to a timestamp on revoke, never deletes), so we mirror
 * that by inserting only when there is no active row. Safe to re-run.
 *
 * Exported for the integration spec at
 * `tests/integration/scripts/seed-smoke-account.consents.spec.ts`.
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
 * Upsert the smoke user and ensure required consents. Exported so the
 * integration spec can drive it against a testcontainer (mirrors the
 * exported `seedMuseums()` pattern from `scripts/seed-museums.ts`).
 */
export async function seedSmokeAccount(
  dataSource: DataSource,
  credentials: { email: string; password: string },
): Promise<{
  userId: number;
  createdUser: boolean;
  consents: Awaited<ReturnType<typeof ensureSmokeConsents>>;
}> {
  const { email, password } = credentials;
  const repo = dataSource.getRepository(User);

  // TD-BC-03 — central BCRYPT_ROUNDS instead of hardcoded literal to avoid
  // drift on next cost bump.
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const now = new Date();

  const existing = await repo.findOne({ where: { email } });

  let userId: number;
  let createdUser: boolean;
  if (existing) {
    await repo.update(existing.id, {
      password: passwordHash,
      email_verified: true,
      role: 'visitor',
      onboarding_completed: true,
      updatedAt: now,
      // Clear stale verification state so the smoke account cannot be poisoned
      // by leftover tokens from earlier deploys.
      verification_token: undefined,
      verification_token_expires: undefined,
      reset_token: undefined,
      reset_token_expires: undefined,
    });
    userId = existing.id;
    createdUser = false;
  } else {
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
    userId = insertedId;
    createdUser = true;
  }

  const consents = await ensureSmokeConsents(dataSource, userId);
  return { userId, createdUser, consents };
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

async function main(): Promise<void> {
  const email = process.env.SMOKE_TEST_EMAIL?.trim();
  const password = process.env.SMOKE_TEST_PASSWORD?.trim();

  if (!email || !password) {
    console.log('seed-smoke-account: SMOKE_TEST_EMAIL/PASSWORD absent — skipping.');
    process.exit(0);
  }

  await AppDataSource.initialize();
  try {
    const { userId, createdUser, consents } = await seedSmokeAccount(AppDataSource, {
      email,
      password,
    });
    console.log(
      `seed-smoke-account: ${createdUser ? 'inserted new user' : 'updated existing user'} id=${userId}, ` +
        `consents created=[${consents.created.join(',')}], already-active=[${consents.alreadyActive.join(',')}]`,
    );
  } finally {
    await AppDataSource.destroy();
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
