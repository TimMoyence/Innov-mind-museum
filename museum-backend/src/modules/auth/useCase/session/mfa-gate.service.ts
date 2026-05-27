import { issueMfaSessionToken } from '@modules/auth/useCase/totp/mfaSessionToken';
import { env } from '@src/config/env';

import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';
import type { UserRole } from '@modules/auth/domain/user/user-role';
import type { User } from '@modules/auth/domain/user/user.entity';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

/**
 * MFA mandatory for cross-tenant/elevated roles — `admin` (B2B museum operator)
 * AND `super_admin`. Excluding super_admin would leave the highest-privilege
 * account unprotected (R16 / SOC2 CC6.1). Other roles keep MFA opt-in.
 */
function requiresMfa(role: UserRole): boolean {
  return role === 'admin' || role === 'super_admin';
}

/**
 * Returned when an enrolled user supplies a valid password but still owes 2FA.
 * FE MUST exchange `mfaSessionToken` via `/auth/mfa/challenge` (TOTP) or
 * `/auth/mfa/recovery` (recovery code).
 */
export interface MfaRequiredResponse {
  mfaRequired: true;
  /** Short-lived bearer (5 min) — opaque to the client. */
  mfaSessionToken: string;
  /** Seconds — drives countdown UI. */
  mfaSessionExpiresIn: number;
}

/**
 * Returned when an admin's MFA warning deadline elapsed without enrollment.
 * FE redirects to `/admin/mfa` → calls `/auth/mfa/enroll`. No JWT until enroll+verify.
 */
export interface MfaEnrollmentRequiredResponse {
  mfaEnrollmentRequired: true;
  /** Hint URL — FE can hard-code its own routing. */
  redirectTo: string;
}

/**
 * MFA gating policy at login:
 *   1. Any user with `enrolledAt` TOTP row gates on 2FA (F6, ADR-014).
 *   2. Admins additionally inherit R16 warning-window: first login stamps
 *      `mfaEnrollmentDeadline=now+warningDays`; past deadline soft-blocks
 *      with `MfaEnrollmentRequiredResponse` until enrollment.
 */
export class MfaGateService {
  /** `totpRepository` optional for legacy unit tests — absent = MFA not-enrolled. */
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly totpRepository?: ITotpSecretRepository,
  ) {}

  /**
   * F6 — MFA policy. F9 (partial): pre-F6 envelope shapes leaked admin
   * enrolled-vs-unenrolled status (admin email enumeration). Post-F6 the
   * oracle is reduced for non-admin roles (always `null` or `mfaRequired`,
   * indistinguishable), but admins still produce 3 distinct shapes — closing
   * that residual requires a uniform `mfaRequired` + follow-up `/api/auth/mfa/status`.
   *
   * Returns: `MfaRequiredResponse` (finish 2FA), `MfaEnrollmentRequiredResponse`
   * (admin only, past deadline), or `null` (issue full JWTs).
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

    // Only `requiresMfa` roles are subject to the enrollment-deadline policy.
    if (!requiresMfa(user.role)) {
      return null;
    }

    const now = Date.now();
    let deadline = user.mfaEnrollmentDeadline ?? null;
    if (!deadline) {
      // First admin login post-deploy → anchor deadline NOW.
      const warningMs = env.auth.mfaEnrollmentWarningDays * 24 * 60 * 60 * 1000;
      deadline = new Date(now + warningMs);
      await this.userRepository.setMfaEnrollmentDeadline(user.id, deadline);
      // Mutate in-memory copy so caller's downstream warning-days read is consistent.
      user.mfaEnrollmentDeadline = deadline;
    }

    if (now >= deadline.getTime()) {
      return {
        mfaEnrollmentRequired: true,
        redirectTo: '/auth/mfa/enroll',
      };
    }

    // Inside warning window — happy path with banner driver attached.
    return null;
  }

  /** Days-remaining for warning banner. `undefined` when N/A. */
  computeWarningDays(user: User): number | undefined {
    if (!requiresMfa(user.role)) return undefined;
    const deadline = user.mfaEnrollmentDeadline;
    if (!deadline) return undefined;
    const ms = deadline.getTime() - Date.now();
    if (ms <= 0) return 0;
    return Math.ceil(ms / (24 * 60 * 60 * 1000));
  }
}
