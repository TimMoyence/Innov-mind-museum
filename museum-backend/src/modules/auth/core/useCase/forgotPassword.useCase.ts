import { IUserRepository } from '../domain/user.repository.interface';
import crypto from 'crypto';

/** Orchestrates the "forgot password" flow: generates a reset token if the user exists. */
export class ForgotPasswordUseCase {
  constructor(private userRepository: IUserRepository) {}

  /**
   * Generate a password-reset token for the given email.
   * Returns `undefined` silently if the user does not exist (to prevent enumeration).
   * @param email - The email to initiate reset for.
   * @returns The reset token string, or `undefined` if the user was not found.
   */
  async execute(email: string): Promise<string | undefined> {
    const user = await this.userRepository.getUserByEmail(email);
    // Pour des raisons de sécurité, on ne renvoie pas d’erreur si l’utilisateur n’existe pas.
    if (!user) return;

    const token = crypto.randomBytes(20).toString('hex');
    const expires = new Date(Date.now() + 3600000); // 1 heure d'expiration
    await this.userRepository.setResetToken(email, token, expires);
    return token;
  }
}
