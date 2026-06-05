import bcrypt from 'bcrypt';

import { AppError, notFound, unauthorized } from '@shared/errors/app.error';

import type { User } from '@modules/auth/domain/user/user.entity';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

/**
 * Narrowed alias — after the password-less branch, `password` is provably
 * non-null. Consumers that need the hash (e.g. `changePassword`'s `isSame`
 * check) can skip the `!` non-null assertion thanks to this return type.
 */
export type ReauthenticatedUser = User & { password: string };

/**
 * PR-9 (UFR-022 RUN_ID 2026-05-23-pr-9-assertPasswordReauth) — shared
 * re-authentication helper. Dedups the load + password-less-guard +
 * `bcrypt.compare(currentPassword, …)` triplet previously inlined in
 * `changePassword`, `changeEmail`, `disableMfa`.
 *
 * Error matrix (spec §6.2) :
 *   - user not found            → 404 NOT_FOUND              ("User not found")
 *   - user.password is null     → 400 SOCIAL_ONLY_ACCOUNT    ("Cannot perform this action on a social-only account")
 *   - bcrypt.compare → false    → 401 INVALID_CREDENTIALS    ("Invalid credentials")
 *   - bcrypt.compare throws     → propagated verbatim (no wrap, no leak)
 *
 * The helper MUST NOT call `bcrypt.compare` when the password-less branch
 * triggers (FR-2 fast-fail) — sentinel-tested via mock call count.
 */
export async function assertPasswordReauth(
  userRepository: IUserRepository,
  userId: number,
  currentPassword: string,
): Promise<ReauthenticatedUser> {
  const user = await userRepository.getUserById(userId);
  if (!user) {
    throw notFound('User not found');
  }

  const passwordHash = user.password;
  if (passwordHash == null) {
    throw new AppError({
      message: 'Cannot perform this action on a social-only account',
      statusCode: 400,
      code: 'SOCIAL_ONLY_ACCOUNT',
    });
  }

  const isValid = await bcrypt.compare(currentPassword, passwordHash);
  if (!isValid) {
    throw unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');
  }

  return user as ReauthenticatedUser;
}
