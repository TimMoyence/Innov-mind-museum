import { issueMfaSessionToken } from '@modules/auth/useCase/totp/mfaSessionToken';
import { env } from '@src/config/env';

import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';
import type { User } from '@modules/auth/domain/user/user.entity';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';
import type { UserRole } from '@modules/auth/domain/user/user-role';

/**
 * MFA enrollment is mandatory for any role with cross-tenant or
 * elevated privileges — `admin` (B2B museum operator) AND `super_admin`
 * (Musaium platform owner). Excluding `super_admin` from MFA would
 * leave the highest-privilege account unprotected, which is the
 * inverse of the intended security posture (R16 / SOC2 CC6.1).
 *
 * Other roles keep MFA opt-in (no warning, no soft-block).
 */
function requiresMfa(role: UserRole): boolean {
  return role === 'admin' || role === 'super_admin';
}

/**
 * Returned instead of `AuthSessionResponse` when an enrolled admin
 * supplies a valid password but still owes the second factor. The frontend
 * MUST exchange `mfaSessionToken` for a real JWT pair via `/auth/mfa/challenge`
 * (TOTP code) or `/auth/mfa/recovery` (recovery code).
 */
export interface MfaRequiredResponse {
  mfaRequired: true;
  /** Short-lived bearer (5 min) — opaque to the client beyond round-tripping. */
  mfaSessionToken: string;
  /** TTL of `mfaSessionToken` in seconds — drives countdown UI. */
  mfaSessionExpiresIn: number;
}

/**
 * Returned when an admin's MFA warning deadline has elapsed without
 * enrollment. The frontend redirects to `/admin/mfa` (or the equivalent RN
 * screen) which calls `/auth/mfa/enroll` directly. Until enrollment + verify
 * complete, no JWTs are issued.
 */
export interface MfaEnrollmentRequiredResponse {
  mfaEnrollmentRequired: true;
  /** Hint URL — frontend can hard-code its own routing instead. */
  redirectTo: string;
}

/**
 * Owns the MFA gating policy applied at login time:
 *
 *   1. Any user with an `enrolledAt` TOTP row gates on the second factor,
 *      regardless of role (F6, ADR-013).
 *   2. Admins additionally inherit the R16 warning-window enrollment policy:
 *      first observed login stamps `mfaEnrollmentDeadline = now + warningDays`,
 *      and once that deadline passes, login is soft-blocked with
 *      `MfaEnrollmentRequiredResponse` until they enroll.
 */
export class MfaGateService {
  /**
   * `totpRepository` is optional so the legacy 2-arg `AuthSessionService`
   * constructor still compiles in unit tests that don't exercise the MFA branch.
   * When absent, MFA is treated as not-enrolled for every user.
   */
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly totpRepository?: ITotpSecretRepository,
  ) {}

  /**
   * F6 (2026-04-30) — Evaluate MFA policy for any user.
   *
   * F9 (2026-04-30 — partial) — Pre-F6 the divergent envelope shapes leaked
   * the enrolled-vs-unenrolled status of admin accounts, enabling enumeration
   * of which admin emails had MFA. Post-F6 the oracle is materially reduced:
   *
   *   - Non-admin roles always return `null` or `mfaRequired:true` —
   *     observationally indistinguishable.
   *   - Admins still produce three distinct shapes (mfaRequired / mfaEnrollment
   *     Required / null) when probed across enrollment + deadline states.
   *     Closing that residual oracle requires migrating to a uniform
   *     `mfaRequired` envelope plus a follow-up `/api/auth/mfa/status` call.
   *
   * Returns:
   *   - `MfaRequiredResponse` — caller must finish the second factor.
   *   - `MfaEnrollmentRequiredResponse` — admin only, past the deadline.
   *   - `null` — proceed to issue full JWTs.
   */
  async evaluateMfaGate(
    user: User,
  ): Promise<MfaRequiredResponse | MfaEnrollmentRequiredResponse | null> {
    const totpRow = await this.totpRepository?.findByUserId(user.id);
    const enrolled = totpRow?.enrolledAt != null;

    if (enrolled) {
      return {
        mfaRequired: true,
        mfaSessionToken: issueMfaSessionToken(user.id),
        mfaSessionExpiresIn: env.auth.mfaSessionTokenTtlSeconds,
      };
    }

    // Non-enrolled: only roles flagged by `requiresMfa` are subject to the
    // enrollment-deadline policy. Other roles keep MFA opt-in.
    if (!requiresMfa(user.role)) {
      return null;
    }

    const now = Date.now();
    let deadline = user.mfaEnrollmentDeadline ?? null;
    if (!deadline) {
      // First admin login post-deploy → anchor the deadline NOW.
      const warningMs = env.auth.mfaEnrollmentWarningDays * 24 * 60 * 60 * 1000;
      deadline = new Date(now + warningMs);
      await this.userRepository.setMfaEnrollmentDeadline(user.id, deadline);
      // Mutate the in-memory copy so the caller's downstream computations
      // (warning days remaining) read consistently.
      user.mfaEnrollmentDeadline = deadline;
    }

    if (now >= deadline.getTime()) {
      return {
        mfaEnrollmentRequired: true,
        redirectTo: '/auth/mfa/enroll',
      };
    }

    // Inside warning window: caller goes through the happy path with a
    // banner driver attached.
    return null;
  }

  /** Days-remaining helper for the warning banner. Returns `undefined` when N/A. */
  computeWarningDays(user: User): number | undefined {
    if (!requiresMfa(user.role)) return undefined;
    const deadline = user.mfaEnrollmentDeadline;
    if (!deadline) return undefined;
    const ms = deadline.getTime() - Date.now();
    if (ms <= 0) return 0;
    return Math.ceil(ms / (24 * 60 * 60 * 1000));
  }
}
