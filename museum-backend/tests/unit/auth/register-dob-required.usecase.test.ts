jest.mock('@shared/logger/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@src/config/env', () => ({
  env: {
    nodeEnv: 'test',
    auth: {
      passwordBreachCheckEnabled: false,
    },
  },
}));

import { RegisterUseCase } from '@modules/auth/useCase/registration/register.useCase';
import { AppError } from '@shared/errors/app.error';
import { makeUser } from 'tests/helpers/auth/user.fixtures';
import { makeUserRepo } from 'tests/helpers/auth/user-repo.mock';

/**
 * RED (UFR-022) — A2 / spec R3 + R4.
 * `RegisterUseCase.execute` MUST reject a missing `dateOfBirth` with a 400 AppError
 * (defence-in-depth, design D2) and MUST NOT call `registerUser`. Today
 * `assertDigitalMajority` early-returns on a falsy DOB (`register.useCase.ts:106`),
 * so registration succeeds — making the R3 cases RED until the bypass is removed.
 * The R4 cases (≥15 succeeds, <15 → 422) pin the age-gate behaviour that must be
 * preserved by the fix.
 */

const ADULT_DOB = '1990-06-13';
const MINOR_DOB = '2020-01-01'; // under 15 as of 2026

describe('RegisterUseCase — dateOfBirth required + age gate (A2 / R3, R4)', () => {
  it('throws a 400 AppError when dateOfBirth is missing and does NOT register', async () => {
    const repo = makeUserRepo(null, {
      registerUser: jest.fn().mockResolvedValue(makeUser({ id: 1 })),
    });
    const useCase = new RegisterUseCase(repo);

    await expect(
      useCase.execute({ email: 'nodob@test.com', password: 'StrongP@ss1!' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.registerUser).not.toHaveBeenCalled();
  });

  it('throws a 400 AppError when dateOfBirth is an empty string', async () => {
    const repo = makeUserRepo(null, {
      registerUser: jest.fn().mockResolvedValue(makeUser({ id: 2 })),
    });
    const useCase = new RegisterUseCase(repo);

    await expect(
      useCase.execute({ email: 'empty@test.com', password: 'StrongP@ss1!', dateOfBirth: '' }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(repo.registerUser).not.toHaveBeenCalled();
  });

  it('rejects an under-15 dateOfBirth with 422 MINOR_PARENTAL_CONSENT_REQUIRED (R4)', async () => {
    const repo = makeUserRepo(null, {
      registerUser: jest.fn().mockResolvedValue(makeUser({ id: 3 })),
    });
    const useCase = new RegisterUseCase(repo);

    await expect(
      useCase.execute({
        email: 'minor@test.com',
        password: 'StrongP@ss1!',
        dateOfBirth: MINOR_DOB,
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: 'MINOR_PARENTAL_CONSENT_REQUIRED',
    });
    expect(repo.registerUser).not.toHaveBeenCalled();
  });

  it('rejects the AppError as an AppError instance for the minor case', async () => {
    const repo = makeUserRepo();
    const useCase = new RegisterUseCase(repo);

    await expect(
      useCase.execute({
        email: 'minor2@test.com',
        password: 'StrongP@ss1!',
        dateOfBirth: MINOR_DOB,
      }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('accepts a valid adult dateOfBirth and registers (R4)', async () => {
    const registered = makeUser({ id: 4, email: 'adult@test.com' });
    const repo = makeUserRepo(null, {
      registerUser: jest.fn().mockResolvedValue(registered),
    });
    const useCase = new RegisterUseCase(repo);

    const result = await useCase.execute({
      email: 'adult@test.com',
      password: 'StrongP@ss1!',
      dateOfBirth: ADULT_DOB,
    });

    expect(result.id).toBe(4);
    expect(repo.registerUser).toHaveBeenCalledWith(
      'adult@test.com',
      'StrongP@ss1!',
      undefined,
      undefined,
      ADULT_DOB,
    );
  });
});
