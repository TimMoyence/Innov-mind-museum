import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';

/** F9 — public envelope for `GET /auth/mfa/status`. */
export interface MfaStatusEnvelope {
  /** True iff a TOTP secret has been enrolled AND verified at least once. */
  mfaEnrolled: boolean;
  /**
   * Active second-factor methods. Today only TOTP is supported; the array
   * shape is forward-compatible with WebAuthn / push factors.
   */
  methods: 'totp'[];
  /**
   * ISO 8601 of the last successful TOTP / recovery code verification. Null
   * when MFA has never been verified (row missing OR enrollment incomplete).
   */
  lastVerifiedAt: string | null;
}

/**
 * F9 — read the calling user's MFA status. Strictly self-scoped; the caller
 * must come from `isAuthenticated` so `req.user.id` is the user being read.
 *
 * Distinct from the enrollment / disable use cases: it never mutates state and
 * never reveals the encrypted secret — so it is safe to expose to the mobile
 * + web clients to drive the "Enable / Disable MFA" UI without first hitting
 * `/me` and inferring from absence.
 */
export class GetMfaStatusUseCase {
  constructor(private readonly totpRepository: ITotpSecretRepository) {}

  /** Self-scoped MFA status read. Never reveals the encrypted secret. */
  async execute(userId: number): Promise<MfaStatusEnvelope> {
    const row = await this.totpRepository.findByUserId(userId);
    if (row?.enrolledAt == null) {
      return { mfaEnrolled: false, methods: [], lastVerifiedAt: null };
    }
    return {
      mfaEnrolled: true,
      methods: ['totp'],
      lastVerifiedAt: (row.lastUsedAt ?? row.enrolledAt).toISOString(),
    };
  }
}
