import type { ConsentScope } from '@modules/auth/domain/consent/userConsent.entity';
import type { IUserConsentRepository } from '@modules/auth/domain/consent/userConsent.repository.interface';

/**
 * GDPR Art. 7 consent gate port — generalised over all `third_party_ai_*`
 * scopes (and any other `ConsentScope`). Mirrors {@link LocationConsentChecker}
 * (`museum-backend/src/modules/chat/useCase/location-resolver.ts:30-32`) but
 * typed on the full {@link ConsentScope} union so a single checker instance
 * services text/image/audio/profile × openai/google dispatch sites.
 *
 * Design ref: `team-state/2026-05-21-p0-gdpr/spec.md` R1, R7 and
 * `design.md` §3 (hexagonal mapping).
 *
 * D3 (fail-CLOSED): anonymous user → `false` without consulting the repo.
 * D7 (refusal shape): caller maps `false` → `AppError('CONSENT_REQUIRED', scope)`
 * for chat-pipeline paths or HTTP 403 for the audio route — this port does NOT
 * surface refusals itself; it only answers the boolean question.
 */
export interface ThirdPartyAiConsentChecker {
  isGranted(userId: number | undefined | null, scope: ConsentScope): Promise<boolean>;
}

/**
 * Builds a {@link ThirdPartyAiConsentChecker} closing over the shared
 * `userConsentRepository` (`museum-backend/src/modules/auth/useCase/index.ts:327`).
 *
 * Lazy-imports `@modules/auth/useCase` mirroring `buildLocationConsentChecker`
 * (`chat-module.ts:834-841`) — avoids a circular init between chat and auth at
 * boot. Tests inject a `repoOverride` so the production lazy-import path is
 * skipped (the override is checked first).
 *
 * D3 fail-CLOSED is enforced HERE (not in the underlying repo) so the
 * production code path never reaches an `await import()` on anonymous calls —
 * one less I/O hop on the hot path and one fewer test seam needed.
 */
export function buildThirdPartyAiConsentChecker(
  repoOverride?: IUserConsentRepository,
): ThirdPartyAiConsentChecker {
  return {
    async isGranted(userId: number | undefined | null, scope: ConsentScope): Promise<boolean> {
      // D3 — anon = refused. No repo call.
      if (userId === undefined || userId === null) {
        return await Promise.resolve(false);
      }
      if (repoOverride) {
        return await repoOverride.isGranted(userId, scope);
      }
      // Lazy import to break the chat ↔ auth init cycle (matches
      // buildLocationConsentChecker at chat-module.ts:834-841).
      const { userConsentRepository } = await import('@modules/auth/useCase');
      return await userConsentRepository.isGranted(userId, scope);
    },
  };
}
