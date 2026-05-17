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
 * F11-mobile (2026-05) — exchanges OTC (delivered via /google/callback deeplink)
 * for the stashed session payload. Single-use: any replay surfaces as
 * 401 INVALID_OTC (same shape as nonce/token errors so mobile UI needs no new branch).
 */
export class RedeemSocialOtcUseCase {
  constructor(private readonly otcStore: SocialOtcStore<AuthSessionResponse>) {}

  /** @throws {AppError} 401 INVALID_OTC if unknown, already consumed, or past TTL. */
  async execute(code: string): Promise<AuthSessionResponse> {
    const session = await this.otcStore.consume(code);
    if (!session) {
      throw invalidOtc();
    }
    return session;
  }
}
