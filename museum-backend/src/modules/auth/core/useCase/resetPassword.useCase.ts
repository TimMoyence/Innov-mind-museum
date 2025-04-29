import { IUserRepository } from '../domain/user.repository.interface';

export class ResetPasswordUseCase {
  constructor(private userRepository: IUserRepository) {}

  async execute(token: string, newPassword: string) {
    const user = await this.userRepository.getUserByResetToken(token);
    if (!user) {
      throw new Error('Token invalide ou expiré.');
    }
    return await this.userRepository.updatePassword(user.id, newPassword);
  }
}
