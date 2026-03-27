import pool from '../../../../data/db';

import type {
  ISocialAccountRepository,
  SocialAccountRow,
} from '../../core/domain/socialAccount.repository.interface';

/** PostgreSQL (raw SQL) implementation of {@link ISocialAccountRepository}. */
export class SocialAccountRepositoryPg implements ISocialAccountRepository {
  /**
   * Finds a social account by provider and provider-specific user ID.
   *
   * @param provider - OAuth provider name (e.g. `apple`, `google`).
   * @param providerUserId - The user's ID within the provider.
   * @returns The matching row or `null`.
   */
  async findByProviderAndProviderUserId(
    provider: string,
    providerUserId: string,
  ): Promise<SocialAccountRow | null> {
    const query = `
      SELECT id, "userId", provider, "providerUserId", email, "createdAt"
      FROM "social_accounts"
      WHERE provider = $1 AND "providerUserId" = $2
      LIMIT 1
    `;
    const result = await pool.query(query, [provider, providerUserId]);
    return result.rows[0] ?? null;
  }

  /**
   * Lists all social accounts linked to a user.
   *
   * @param userId - Numeric user ID.
   * @returns Array of social account rows.
   */
  async findByUserId(userId: number): Promise<SocialAccountRow[]> {
    const query = `
      SELECT id, "userId", provider, "providerUserId", email, "createdAt"
      FROM "social_accounts"
      WHERE "userId" = $1
    `;
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  /**
   * Links a new social account to an existing user.
   *
   * @param params - User ID, provider, providerUserId, and optional email.
   * @param params.userId - Owning user ID.
   * @param params.provider - OAuth provider name.
   * @param params.providerUserId - User's ID within the provider.
   * @param params.email - Optional email from the provider.
   * @returns The inserted social account row.
   */
  async create(params: {
    userId: number;
    provider: string;
    providerUserId: string;
    email?: string | null;
  }): Promise<SocialAccountRow> {
    const query = `
      INSERT INTO "social_accounts" ("userId", provider, "providerUserId", email)
      VALUES ($1, $2, $3, $4)
      RETURNING id, "userId", provider, "providerUserId", email, "createdAt"
    `;
    const values = [params.userId, params.provider, params.providerUserId, params.email ?? null];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Deletes all social accounts linked to a user.
   *
   * @param userId - Numeric user ID.
   */
  async deleteByUserId(userId: number): Promise<void> {
    await pool.query('DELETE FROM "social_accounts" WHERE "userId" = $1', [userId]);
  }
}
