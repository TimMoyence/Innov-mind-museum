import { AppError } from '@shared/errors/app.error';

import type { SocialOtcStore } from '@modules/auth/domain/ports/social-otc-store.port';
import type { AuthSessionResponse } from '@modules/auth/useCase/session/authSession.service';

const invalidOtc = (): AppError =>
  new AppError({
    message: 'Invalid or expired one-time code',
    statusCode: 401,
    code: 'INVALID_OTC',
  });

/**
 * F11-mobile (2026-05) — exchanges a server-issued one-time-code (delivered
 * to the mobile client via the `/google/callback` deeplink redirect) for the
 * authenticated session payload that was stashed at the moment Google
 * confirmed the user.
 *
 * Single-use: the OTC is atomically consumed by {@link SocialOtcStore.consume}.
 * Any replay (already consumed, expired, or never issued) surfaces as a
 * 401 INVALID_OTC for the caller — same shape as the existing nonce / token
 * verification errors so the mobile UI does not need a new branch.
 */
export class RedeemSocialOtcUseCase {
  constructor(private readonly otcStore: SocialOtcStore<AuthSessionResponse>) {}

  /**
   * Atomically consume {@link code} and return the cached session payload.
   * Throws {@link AppError} 401 INVALID_OTC when the code is unknown,
   * already consumed, or past its TTL.
   */
  async execute(code: string): Promise<AuthSessionResponse> {
    const session = await this.otcStore.consume(code);
    if (!session) {
      throw invalidOtc();
    }
    return session;
  }
}
