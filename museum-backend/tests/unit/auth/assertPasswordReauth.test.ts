/**
 * UFR-022 red phase — PR-9 assertPasswordReauth helper.
 * RUN_ID: 2026-05-23-pr-9-assertPasswordReauth.
 *
 * Behavioural test of the new shared re-authentication helper introduced to
 * deduplicate the load + social-only-guard + bcrypt.compare(currentPassword)
 * triplet currently inlined in:
 *   - changePassword.useCase.ts (lines 22-34)
 *   - changeEmail.useCase.ts   (lines 28-40)
 *   - disableMfa.useCase.ts    (lines 20-37)
 *
 * Spec/Design sources of truth (read-only inputs to this phase):
 *   .claude/skills/team/team-state/2026-05-23-pr-9-assertPasswordReauth/spec.md §5 (FR-1..FR-6)
 *                                                                              §6.2 (error matrix)
 *                                                                              §7.4 (AC-14, AC-15)
 *   .claude/skills/team/team-state/2026-05-23-pr-9-assertPasswordReauth/design.md §2 (helper shape)
 *                                                                                §4.1 (T-U1..T-U5 matrix)
 *
 * Pre-green expectation: this file FAILS with
 *   `Cannot find module '@modules/auth/useCase/shared/assertPasswordReauth'`
 * because the helper does not yet exist on disk.
 *
 * Post-green expectation: all 5 cases pass (helper implements the matrix).
 *
 * Frozen-test discipline (UFR-022): this file is sha256-hashed in
 * `red-test-manifest.json`. Green phase MUST NOT modify it. Suspected bug →
 * emit `BLOCK-TEST-WRONG <file>:<line> <reason>`, do NOT touch.
 */
import bcrypt from 'bcrypt';

import { assertPasswordReauth } from '@modules/auth/useCase/shared/assertPasswordReauth';

import { makeUser } from '../../helpers/auth/user.fixtures';
import { makeUserRepo } from '../../helpers/auth/user-repo.mock';

jest.mock('bcrypt', () => ({
  ...jest.requireActual('bcrypt'),
  compare: jest.fn(),
}));

describe('assertPasswordReauth', () => {
  beforeEach(() => {
    (bcrypt.compare as jest.Mock).mockReset();
  });

  it('T-U1 — returns the loaded User on happy path (bcrypt.compare returns true)', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
    const user = makeUser();
    const repo = makeUserRepo(user);

    const returned = await assertPasswordReauth(repo, 1, 'currentPass1');

    expect(returned).toBe(user);
    expect(repo.getUserById).toHaveBeenCalledWith(1);
    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
    expect(bcrypt.compare).toHaveBeenCalledWith('currentPass1', user.password);
  });

  it('T-U2 — throws 404 NOT_FOUND when repo returns null (user not found)', async () => {
    const repo = makeUserRepo(null);

    await expect(assertPasswordReauth(repo, 999, 'anything')).rejects.toMatchObject({
      message: 'User not found',
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('T-U3 — throws 400 SOCIAL_ONLY_ACCOUNT when user.password is null AND skips bcrypt.compare', async () => {
    const repo = makeUserRepo(makeUser({ password: null }));

    await expect(assertPasswordReauth(repo, 1, 'anything')).rejects.toMatchObject({
      message: 'Cannot perform this action on a social-only account',
      statusCode: 400,
      code: 'SOCIAL_ONLY_ACCOUNT',
    });
    // FR-2 fast-fail: helper MUST NOT call bcrypt.compare for social-only users.
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('T-U4 — throws 401 INVALID_CREDENTIALS when bcrypt.compare returns false', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false);
    const repo = makeUserRepo(makeUser());

    await expect(assertPasswordReauth(repo, 1, 'wrongPass')).rejects.toMatchObject({
      message: 'Invalid credentials',
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
    });
    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
  });

  it('T-U5 — propagates bcrypt.compare errors verbatim (no wrap, no leak)', async () => {
    const underlying = new Error('bcrypt corrupted hash');
    (bcrypt.compare as jest.Mock).mockRejectedValueOnce(underlying);
    const repo = makeUserRepo(makeUser());

    await expect(assertPasswordReauth(repo, 1, 'whatever')).rejects.toBe(underlying);
  });
});
