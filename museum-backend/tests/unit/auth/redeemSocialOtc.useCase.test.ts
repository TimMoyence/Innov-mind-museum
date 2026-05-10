/**
 * F11-mobile (2026-05) — RedeemSocialOtcUseCase unit tests.
 *
 * Asserts the contract that the mobile redeem endpoint relies on:
 * - First redemption inside TTL returns the session payload.
 * - Replay (already consumed) throws AppError 401 INVALID_OTC.
 * - Unknown / malformed codes throw AppError 401 INVALID_OTC.
 */
import { AppError } from '@shared/errors/app.error';

import { InMemorySocialOtcStore } from '@modules/auth/adapters/secondary/social/social-otc-store';
import { RedeemSocialOtcUseCase } from '@modules/auth/useCase/social/redeemSocialOtc.useCase';

import type { AuthSessionResponse } from '@modules/auth/useCase/session/authSession.service';

const fakeSession = (): AuthSessionResponse => ({
  accessToken: 'access-token-stub',
  refreshToken: 'refresh-token-stub',
  expiresIn: 900,
  refreshExpiresIn: 604_800,
  user: {
    id: 7,
    email: 'mobile@example.com',
    role: 'visitor',
    onboardingCompleted: false,
  },
});

describe('RedeemSocialOtcUseCase', () => {
  it('returns the session payload on the first call', async () => {
    const otcStore = new InMemorySocialOtcStore<AuthSessionResponse>();
    const session = fakeSession();
    const code = await otcStore.issue(session);

    const useCase = new RedeemSocialOtcUseCase(otcStore);
    await expect(useCase.execute(code)).resolves.toEqual(session);
  });

  it('rejects a replayed code with 401 INVALID_OTC', async () => {
    const otcStore = new InMemorySocialOtcStore<AuthSessionResponse>();
    const code = await otcStore.issue(fakeSession());

    const useCase = new RedeemSocialOtcUseCase(otcStore);
    await useCase.execute(code); // first redemption succeeds

    await expect(useCase.execute(code)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_OTC',
    });
  });

  it('rejects an unknown code with 401 INVALID_OTC', async () => {
    const otcStore = new InMemorySocialOtcStore<AuthSessionResponse>();
    const useCase = new RedeemSocialOtcUseCase(otcStore);

    await expect(useCase.execute('never-issued-code')).rejects.toBeInstanceOf(AppError);
    await expect(useCase.execute('never-issued-code')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_OTC',
    });
  });
});
