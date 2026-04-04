/** Plain data transfer object for a social account record. */
export interface SocialAccountRow {
  id: string;
  userId: number;
  provider: string;
  providerUserId: string;
  email: string | null;
  createdAt: Date;
}

/** Port for social account persistence operations. Implemented by {@link SocialAccountRepositoryPg}. */
export interface ISocialAccountRepository {
  /**
   * Find a social account by provider and external user ID.
   *
   * @param provider - The social provider (e.g. `"apple"`, `"google"`).
   * @param providerUserId - The user's ID on the provider.
   * @returns The social account row, or `null` if not linked.
   */
  findByProviderAndProviderUserId(
    provider: string,
    providerUserId: string,
  ): Promise<SocialAccountRow | null>;

  /**
   * List all social accounts linked to a user.
   *
   * @param userId - The user's ID.
   * @returns All linked social account rows.
   */
  findByUserId(userId: number): Promise<SocialAccountRow[]>;

  /**
   * Create a new social account link.
   *
   * @param params - Provider, provider user ID, and owning user ID.
   * @param params.userId - Owning user ID.
   * @param params.provider - OAuth provider name.
   * @param params.providerUserId - User's ID within the provider.
   * @param params.email - Optional email from the provider.
   * @returns The created social account row.
   */
  create(params: {
    userId: number;
    provider: string;
    providerUserId: string;
    email?: string | null;
  }): Promise<SocialAccountRow>;

  /**
   * Delete all social accounts for a user (used during account deletion).
   *
   * @param userId - The user's ID.
   */
  deleteByUserId(userId: number): Promise<void>;
}
