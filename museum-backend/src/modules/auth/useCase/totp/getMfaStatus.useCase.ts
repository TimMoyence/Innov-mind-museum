import type { ITotpSecretRepository } from '@modules/auth/domain/totp/totp-secret.repository.interface';

/** F9 — public envelope for `GET /auth/mfa/status`. */
export interface MfaStatusEnvelope {
  /** True iff enrolled AND verified at least once. */
  mfaEnrolled: boolean;
  /** Forward-compatible with WebAuthn/push factors. */
  methods: 'totp'[];
  /** ISO 8601. Null if MFA never verified (row missing OR enrollment incomplete). */
  lastVerifiedAt: string | null;
}

/**
 * F9 — self-scoped MFA status read; never mutates state, never reveals secret.
 * Safe to expose to drive Enable/Disable UI without hitting `/me` and inferring.
 */
export class GetMfaStatusUseCase {
  constructor(private readonly totpRepository: ITotpSecretRepository) {}

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
