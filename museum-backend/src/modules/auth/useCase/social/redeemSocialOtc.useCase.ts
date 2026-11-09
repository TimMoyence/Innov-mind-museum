import { AppError } from '@shared/errors/app.error';

import type { SocialOtcStore } from '@modules/auth/domain/ports/social-otc-store.port';
import type { AuthSessionResponse } from '@modules/auth/useCase/session/authSession.service';

const invalidOtc = (): AppError =>
  new AppError({
    message: 'Invalid or expired one-time code',
    statusCode: 401,
    code: 'INVALID_OTC',
  });

export class RedeemSocialOtcUseCase {
  constructor(private readonly otcStore: SocialOtcStore<AuthSessionResponse>) {}

  async execute(code: string): Promise<AuthSessionResponse> {
    const session = await this.otcStore.consume(code);
    if (!session) {
      throw invalidOtc();
    }
    return session;
  }
}
