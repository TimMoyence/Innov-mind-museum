import { IUserRepository } from '../domain/user.repository.interface';
import crypto from 'crypto';

export class ForgotPasswordUseCase {
  constructor(private userRepository: IUserRepository) {}

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
