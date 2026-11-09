import bcrypt from 'bcrypt';
import crypto from 'node:crypto';

import { ForgotPasswordUseCase } from '@modules/auth/useCase/password/forgotPassword.useCase';
import { ResetPasswordUseCase } from '@modules/auth/useCase/password/resetPassword.useCase';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';
import type { IRefreshTokenRepository } from '@modules/auth/domain/refresh-token/refresh-token.repository.interface';
import type { User } from '@modules/auth/domain/user/user.entity';
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
        resetSlot = null;
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
    expect(issuedToken!.length).toBeGreaterThanOrEqual(64);

    const getByEmailMock = userRepo.getUserByEmail as jest.Mock;
    expect(getByEmailMock).toHaveBeenCalledWith('visitor@musaium.com');

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

    const consumeMock = userRepo.consumeResetTokenAndUpdatePassword as jest.Mock;
    expect(consumeMock).not.toHaveBeenCalled();

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

    await expect(reset.execute(issuedToken!, 'AnotherStr0ng!Pwd')).rejects.toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(refreshRepo.revokeAllForUser).toHaveBeenCalledTimes(1);
  });
});
