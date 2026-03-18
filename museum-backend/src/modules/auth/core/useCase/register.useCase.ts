import { IUserRepository } from '../domain/user.repository.interface';
import { User } from '../domain/user.entity';
import { validateEmail } from '../../adapters/secondary/email.service';

/** Orchestrates new user registration with email/password. */
export class RegisterUseCase {
  constructor(private userRepository: IUserRepository) {}

  /**
   * Validate email format and register a new user.
   * @param email - The user's email address.
   * @param password - The user's chosen password.
   * @param firstname - Optional first name.
   * @param lastname - Optional last name.
   * @returns The newly created user.
   * @throws {Error} If the email format is invalid.
   */
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
