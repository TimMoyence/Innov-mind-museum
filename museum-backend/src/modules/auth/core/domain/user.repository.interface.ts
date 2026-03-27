import type { User } from './user.entity';

/** Port for user persistence operations. Implemented by {@link UserRepositoryPg}. */
export interface IUserRepository {
  /**
   * Find a user by email address.
   *
   * @param email - The email to look up.
   * @returns The user, or `null` if not found.
   */
  getUserByEmail(email: string): Promise<User | null>;

  /**
   * Find a user by numeric ID.
   *
   * @param id - The user's primary key.
   * @returns The user, or `null` if not found.
   */
  getUserById(id: number): Promise<User | null>;

  /**
   * Register a new user with email/password credentials.
   *
   * @param email - Unique email address.
   * @param password - Plain-text password (hashed before storage).
   * @param firstname - Optional first name.
   * @param lastname - Optional last name.
   * @returns The newly created user.
   */
  registerUser(
    email: string,
    password: string,
    firstname?: string,
    lastname?: string,
  ): Promise<User>;

  /**
   * Store a password-reset token and its expiration for a user.
   *
   * @param email - The user's email.
   * @param token - The reset token.
   * @param expires - Token expiration timestamp.
   * @returns The updated user.
   */
  setResetToken(email: string, token: string, expires: Date): Promise<User>;

  /**
   * Find a user by a valid (non-expired) password-reset token.
   *
   * @param token - The reset token.
   * @returns The user, or `null` if the token is invalid or expired.
   */
  getUserByResetToken(token: string): Promise<User | null>;

  /**
   * Update a user's password.
   *
   * @param userId - The user's ID.
   * @param newPassword - Plain-text password (hashed before storage).
   * @returns The updated user.
   */
  updatePassword(userId: number, newPassword: string): Promise<User>;

  /**
   * Register a new user via social sign-in (no password).
   *
   * @param email - Email from the social provider.
   * @param firstname - Optional first name from the provider.
   * @param lastname - Optional last name from the provider.
   * @returns The newly created user.
   */
  registerSocialUser(email: string, firstname?: string, lastname?: string): Promise<User>;

  /**
   * Atomically consume a reset token and update the user's password in a single query.
   * Prevents race conditions where two requests use the same token.
   *
   * @param token - The reset token to consume.
   * @param hashedPassword - The new bcrypt-hashed password.
   * @returns The updated user, or `null` if the token is invalid or expired.
   */
  consumeResetTokenAndUpdatePassword(token: string, hashedPassword: string): Promise<User | null>;

  /**
   * Permanently delete a user and all associated data (GDPR).
   *
   * @param userId - The user's ID.
   */
  deleteUser(userId: number): Promise<void>;

  /**
   * Store an email verification token with an expiration timestamp.
   *
   * @param userId - The user's ID.
   * @param token - The verification token.
   * @param expires - Token expiration timestamp.
   */
  setVerificationToken(userId: number, token: string, expires: Date): Promise<void>;

  /**
   * Atomically consume a verification token and mark the email as verified.
   *
   * @param token - The verification token to consume.
   * @returns The user if the token was valid and consumed, or `null` if invalid/expired.
   */
  verifyEmail(token: string): Promise<User | null>;

  /**
   * Store an email change token, pending email, and expiry on the user record.
   *
   * @param userId - The user's ID.
   * @param hashedToken - SHA-256 hash of the email change token.
   * @param pendingEmail - The new email to be confirmed.
   * @param expires - Token expiration timestamp.
   */
  setEmailChangeToken(
    userId: number,
    hashedToken: string,
    pendingEmail: string,
    expires: Date,
  ): Promise<void>;

  /**
   * Atomically consume an email change token and update the user's email.
   * Clears pending_email, email_change_token, and email_change_token_expiry.
   *
   * @param hashedToken - SHA-256 hash of the email change token.
   * @returns The updated user, or `null` if the token is invalid or expired.
   */
  consumeEmailChangeToken(hashedToken: string): Promise<User | null>;
}
