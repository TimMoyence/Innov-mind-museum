import { IUserRepository } from '../domain/user.repository.interface';

/** Orchestrates password reset using a one-time token. */
export class ResetPasswordUseCase {
  constructor(private userRepository: IUserRepository) {}

  /**
   * Validate a reset token and update the user's password.
   * @param token - The password-reset token.
   * @param newPassword - The new plain-text password.
   * @returns The updated user.
   * @throws {Error} If the token is invalid or expired.
   */
  async execute(token: string, newPassword: string) {
    const user = await this.userRepository.getUserByResetToken(token);
    if (!user) {
      throw new Error('Token invalide ou expiré.');
    }
    return await this.userRepository.updatePassword(user.id, newPassword);
  }
}
