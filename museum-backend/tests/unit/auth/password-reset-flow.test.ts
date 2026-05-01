/**
 * P2 — Password reset full happy-path + edge cases.
 *
 * Existing coverage is split: `forgotPassword.useCase.test.ts` and
 * `resetPassword.useCase.test.ts` cover each leg with mocked repos, and
 * `auth.route.test.ts` checks Zod rejection on the routes. The actual
 * end-to-end transition `forgot → consume token → re-login` was never
 * exercised — this suite closes that gap.
 *
 * Strategy:
 *   - Real ForgotPasswordUseCase + ResetPasswordUseCase
 *   - Stateful in-memory user repo so `setResetToken` is observable by
 *     `consumeResetTokenAndUpdatePassword`
 *   - Real RefreshTokenRepository mock that records `revokeAllForUser` calls
 *   - Real bcrypt + crypto round trip (no SUT mocking — UFR-006)
 */

import bcrypt from 'bcrypt';
import crypto from 'node:crypto';

import { ForgotPasswordUseCase } from '@modules/auth/useCase/forgotPassword.useCase';
import { ResetPasswordUseCase } from '@modules/auth/useCase/resetPassword.useCase';
import type { IUserRepository } from '@modules/auth/domain/user.repository.interface';
import type { IRefreshTokenRepository } from '@modules/auth/domain/refresh-token.repository.interface';
import type { User } from '@modules/auth/domain/user.entity';
import { BCRYPT_ROUNDS } from '@shared/security/bcrypt';
import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeUserRepo, makeRefreshTokenRepo } from '../../helpers/auth/user-repo.mock';

interface ResetTokenSlot {
  hashedToken: string;
  expires: Date;
}

const STRONG_PASSWORD = 'CorrectHorseBattery9!';
const NEW_PASSWORD = 'NewCorrect42!Horse';

const buildStatefulUserRepo = (initial: User): IUserRepository => {
  let user: User = { ...initial };
  let resetSlot: ResetTokenSlot | null = null;

  // Start from the shared mock and override only the methods this flow exercises.
  const repo = makeUserRepo(user, {
    getUserByEmail: jest.fn().mockImplementation(async (email: string) => {
      return email.toLowerCase() === user.email.toLowerCase() ? user : null;
    }),
    setResetToken: jest
      .fn()
      .mockImplementation(async (_email: string, hashedToken: string, expires: Date) => {
        resetSlot = { hashedToken, expires };
      }),
    consumeResetTokenAndUpdatePassword: jest
      .fn()
      .mockImplementation(async (hashedToken: string, hashedPassword: string) => {
        if (!resetSlot) return null;
        if (resetSlot.hashedToken !== hashedToken) return null;
        if (resetSlot.expires.getTime() < Date.now()) return null;
        user = { ...user, password: hashedPassword };
        resetSlot = null; // single-use
        return user;
      }),
    getUserById: jest.fn().mockImplementation(async (id: number) => (id === user.id ? user : null)),
  });

  return repo;
};

const buildRefreshRepo = (): jest.Mocked<IRefreshTokenRepository> => {
  return makeRefreshTokenRepo({
    revokeAllForUser: jest.fn().mockResolvedValue(undefined),
  });
};

describe('password reset flow (P2 user-flow)', () => {
  it('happy path — forgot issues token, reset consumes it, refresh tokens revoked', async () => {
    const initialHashed = await bcrypt.hash(STRONG_PASSWORD, BCRYPT_ROUNDS);
    const userRepo = buildStatefulUserRepo(
      makeUser({
        id: 7,
        email: 'visitor@musaium.com',
        password: initialHashed,
        email_verified: true,
      }),
    );
    const refreshRepo = buildRefreshRepo();
    const forgot = new ForgotPasswordUseCase(userRepo);
    const reset = new ResetPasswordUseCase(userRepo, refreshRepo);

    const issuedToken = await forgot.execute('Visitor@Musaium.com');
    expect(issuedToken).toBeTruthy();
    expect(typeof issuedToken).toBe('string');
    expect(issuedToken!.length).toBeGreaterThanOrEqual(64); // 32 bytes hex

    // Email normalisation: the use case must lookup by lowercased email,
    // mirroring the real PG repo (`SELECT … WHERE LOWER(email) = $1`).
    const getByEmailMock = userRepo.getUserByEmail as jest.Mock;
    expect(getByEmailMock).toHaveBeenCalledWith('visitor@musaium.com');

    // Stored hash must NOT equal the raw token (bug guard).
    const setResetMock = userRepo.setResetToken as jest.Mock;
    expect(setResetMock).toHaveBeenCalledTimes(1);
    const [, storedHashedToken] = setResetMock.mock.calls[0];
    expect(storedHashedToken).not.toBe(issuedToken);
    expect(storedHashedToken).toBe(crypto.createHash('sha256').update(issuedToken!).digest('hex'));

    const updated = await reset.execute(issuedToken!, NEW_PASSWORD);

    expect(updated).toBeTruthy();
    expect(updated.id).toBe(7);
    expect(updated.password).toBeTruthy();
    expect(await bcrypt.compare(NEW_PASSWORD, updated.password!)).toBe(true);
    expect(await bcrypt.compare(STRONG_PASSWORD, updated.password!)).toBe(false);
    expect(refreshRepo.revokeAllForUser).toHaveBeenCalledWith(7);
  });

  it('returns undefined for unverified emails (anti-enumeration, no token issued)', async () => {
    const initialHashed = await bcrypt.hash(STRONG_PASSWORD, BCRYPT_ROUNDS);
    const userRepo = buildStatefulUserRepo(
      makeUser({
        id: 8,
        email: 'unverified@musaium.com',
        password: initialHashed,
        email_verified: false,
      }),
    );
    const forgot = new ForgotPasswordUseCase(userRepo);

    const token = await forgot.execute('unverified@musaium.com');

    expect(token).toBeUndefined();
    expect(userRepo.setResetToken).not.toHaveBeenCalled();
  });

  it('returns undefined for unknown emails (anti-enumeration)', async () => {
    const userRepo = buildStatefulUserRepo(
      makeUser({ id: 9, email: 'real@musaium.com', email_verified: true }),
    );
    const forgot = new ForgotPasswordUseCase(userRepo);

    const token = await forgot.execute('ghost@musaium.com');

    expect(token).toBeUndefined();
    expect(userRepo.setResetToken).not.toHaveBeenCalled();
  });

  it('rejects an invalid token with 400', async () => {
    const userRepo = buildStatefulUserRepo(
      makeUser({ id: 10, email: 'visitor@musaium.com', email_verified: true }),
    );
    const refreshRepo = buildRefreshRepo();
    const reset = new ResetPasswordUseCase(userRepo, refreshRepo);

    await expect(reset.execute('not-a-real-token', NEW_PASSWORD)).rejects.toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(refreshRepo.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('rejects an expired token with 400', async () => {
    const userRepo = buildStatefulUserRepo(
      makeUser({ id: 11, email: 'visitor@musaium.com', email_verified: true }),
    );
    const refreshRepo = buildRefreshRepo();
    const forgot = new ForgotPasswordUseCase(userRepo);
    const reset = new ResetPasswordUseCase(userRepo, refreshRepo);

    const issuedToken = await forgot.execute('visitor@musaium.com');
    expect(issuedToken).toBeTruthy();

    // Force the slot to expire. `mockClear()` only resets the call log;
    // the closure-backed `resetSlot` keeps state, and the manual call
    // below overwrites it with a past-dated expiry.
    const setResetMock = userRepo.setResetToken as jest.Mock;
    setResetMock.mockClear();
    await userRepo.setResetToken(
      'visitor@musaium.com',
      crypto.createHash('sha256').update(issuedToken!).digest('hex'),
      new Date(Date.now() - 1_000),
    );

    await expect(reset.execute(issuedToken!, NEW_PASSWORD)).rejects.toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(refreshRepo.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('rejects a weak new password without consuming the token', async () => {
    const userRepo = buildStatefulUserRepo(
      makeUser({ id: 12, email: 'visitor@musaium.com', email_verified: true }),
    );
    const refreshRepo = buildRefreshRepo();
    const forgot = new ForgotPasswordUseCase(userRepo);
    const reset = new ResetPasswordUseCase(userRepo, refreshRepo);

    const issuedToken = await forgot.execute('visitor@musaium.com');
    await expect(reset.execute(issuedToken!, 'weak')).rejects.toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );

    // The token slot must NOT be consumed by the rejected weak attempt.
    // `validatePassword` runs before `consumeResetTokenAndUpdatePassword`
    // in the use case — pin that ordering invariant explicitly so a
    // future refactor that swaps the order can't ship.
    const consumeMock = userRepo.consumeResetTokenAndUpdatePassword as jest.Mock;
    expect(consumeMock).not.toHaveBeenCalled();

    // Token should still be redeemable for the legitimate user.
    const second = await reset.execute(issuedToken!, NEW_PASSWORD);
    expect(second).toBeTruthy();
    expect(consumeMock).toHaveBeenCalledTimes(1);
    expect(refreshRepo.revokeAllForUser).toHaveBeenCalledTimes(1);
  });

  it('one-shot tokens — second consumption fails', async () => {
    const userRepo = buildStatefulUserRepo(
      makeUser({ id: 13, email: 'visitor@musaium.com', email_verified: true }),
    );
    const refreshRepo = buildRefreshRepo();
    const forgot = new ForgotPasswordUseCase(userRepo);
    const reset = new ResetPasswordUseCase(userRepo, refreshRepo);

    const issuedToken = await forgot.execute('visitor@musaium.com');
    expect(issuedToken).toBeTruthy();

    const first = await reset.execute(issuedToken!, NEW_PASSWORD);
    expect(first).toBeTruthy();

    // Same token replayed must be rejected.
    await expect(reset.execute(issuedToken!, 'AnotherStr0ng!Pwd')).rejects.toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(refreshRepo.revokeAllForUser).toHaveBeenCalledTimes(1);
  });
});
