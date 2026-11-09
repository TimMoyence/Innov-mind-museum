import bcrypt from 'bcrypt';

import { AppError, notFound, unauthorized } from '@shared/errors/app.error';

import type { User } from '@modules/auth/domain/user/user.entity';
import type { IUserRepository } from '@modules/auth/domain/user/user.repository.interface';

export type ReauthenticatedUser = User & { password: string };

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
