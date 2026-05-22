/**
 * Shared factories for `third_party_ai_*` consent test data.
 *
 * UFR-022 — Cluster A red phase (RUN_ID=2026-05-21-p0-gdpr):
 * red tests reference these factories instead of inlining `as UserConsent` shapes
 * (CLAUDE.md test-discipline + ESLint `musaium-test-discipline/no-inline-test-entities`).
 *
 * Factories return PARTIAL grants/denials suitable for in-memory consent repos
 * (see `tests/helpers/auth/userConsent-repo.mock.ts`). They do NOT mint domain
 * entities — they only describe the (userId, scope, source) intent and let the
 * mock repository materialise actual rows via `.grant()`.
 */
import type {
  ConsentScope,
  ConsentSource,
  UserConsent,
} from '@modules/auth/domain/consent/userConsent.entity';
import type { IUserConsentRepository } from '@modules/auth/domain/consent/userConsent.repository.interface';

export interface ConsentGrantSpec {
  userId: number;
  scope: ConsentScope;
  version?: string;
  source?: ConsentSource;
}

/**
 * Describes a granted-scope intent for a user.
 *
 * Use with {@link applyConsentGrantSpec} to materialise into an in-memory
 * `IUserConsentRepository` (typically the one from `userConsent-repo.mock.ts`).
 */
export const makeConsentGranted = (overrides: Partial<ConsentGrantSpec> = {}): ConsentGrantSpec => {
  return {
    userId: 1,
    scope: 'third_party_ai_text_openai',
    version: '1.0.0',
    source: 'ui',
    ...overrides,
  };
};

/**
 * Describes a denied-scope intent for a user (i.e. NO grant row present).
 *
 * Returning the same spec shape as {@link makeConsentGranted} keeps the call
 * sites symmetrical: the denial is the ABSENCE of a grant — the helper
 * intentionally returns the spec so tests can be explicit about which scope
 * is denied (rather than relying on "empty store === everything denied").
 */
export const makeConsentDenied = (overrides: Partial<ConsentGrantSpec> = {}): ConsentGrantSpec => {
  return {
    userId: 1,
    scope: 'third_party_ai_text_openai',
    version: '1.0.0',
    source: 'ui',
    ...overrides,
  };
};

/**
 * Materialises a {@link ConsentGrantSpec} into an in-memory consent repository
 * (idempotent on duplicate calls per the in-memory implementation's append-only
 * semantics).
 */
export async function applyConsentGrantSpec(
  repo: IUserConsentRepository,
  spec: ConsentGrantSpec,
): Promise<UserConsent> {
  return await repo.grant(spec.userId, spec.scope, spec.version ?? '1.0.0', spec.source ?? 'ui');
}
