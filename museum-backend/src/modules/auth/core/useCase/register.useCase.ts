import { IUserRepository } from '../domain/user.repository.interface';
import { User } from '../domain/user.entity';
import { validateEmail } from '../../adapters/secondary/email.service';

export class RegisterUseCase {
  constructor(private userRepository: IUserRepository) {}

  async execute(
    email: string,
    password: string,
    firstname?: string,
    lastname?: string,
  ): Promise<User> {
    if (!validateEmail(email)) {
      throw new Error("Format d'email invalide.");
    }
    // Vous pouvez ajouter ici d'autres validations (force du mot de passe, etc.)
    return await this.userRepository.registerUser(
      email,
      password,
      firstname,
      lastname,
    );
  }
}
