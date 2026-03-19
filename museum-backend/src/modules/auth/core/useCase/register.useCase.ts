import { IUserRepository } from '../domain/user.repository.interface';
import { User } from '../domain/user.entity';
import { validateEmail } from '../../adapters/secondary/email.service';
import { validatePassword } from '@shared/validation/password';
import { validateNameField } from '@shared/validation/input';
import { badRequest } from '@shared/errors/app.error';

/** Orchestrates new user registration with email/password. */
export class RegisterUseCase {
  constructor(private userRepository: IUserRepository) {}

  /**
   * Validate email format, password strength, and name fields, then register a new user.
   * @param email - The user's email address.
   * @param password - The user's chosen password.
   * @param firstname - Optional first name.
   * @param lastname - Optional last name.
   * @returns The newly created user.
   * @throws {AppError} 400 if validation fails.
   */
  async execute(
    email: string,
    password: string,
    firstname?: string,
    lastname?: string,
  ): Promise<User> {
    const normalizedEmail = email.trim().toLowerCase();

    if (!validateEmail(normalizedEmail)) {
      throw badRequest('Invalid email format');
    }

    const pw = validatePassword(password);
    if (!pw.valid) {
      throw badRequest(pw.reason!);
    }

    let sanitizedFirstname: string | undefined;
    let sanitizedLastname: string | undefined;
    try {
      sanitizedFirstname = validateNameField(firstname, 'firstname');
      sanitizedLastname = validateNameField(lastname, 'lastname');
    } catch (error) {
      throw badRequest((error as Error).message);
    }

    return await this.userRepository.registerUser(
      normalizedEmail,
      password,
      sanitizedFirstname,
      sanitizedLastname,
    );
  }
}
