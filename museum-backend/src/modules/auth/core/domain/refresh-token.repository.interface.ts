/** Row shape for a persisted refresh token in the `auth_refresh_tokens` table. */
export interface StoredRefreshTokenRow {
  id: string;
  userId: number;
  jti: string;
  familyId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
  reuseDetectedAt: Date | null;
  replacedByTokenId: string | null;
  createdAt: Date;
}

/** Input for inserting a new refresh token. */
export interface InsertRefreshTokenInput {
  userId: number;
  jti: string;
  familyId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
}

/** Port for refresh-token lifecycle persistence operations. Implemented by {@link RefreshTokenRepositoryPg}. */
export interface IRefreshTokenRepository {
  /**
   * Inserts a new refresh token row.
   * @param input - Token metadata (userId, jti, familyId, hash, dates).
   * @returns The inserted row.
   */
  insert(input: InsertRefreshTokenInput): Promise<StoredRefreshTokenRow>;

  /**
   * Finds a refresh token by its JTI claim.
   * @param jti - JWT ID.
   * @returns The token row or `null`.
   */
  findByJti(jti: string): Promise<StoredRefreshTokenRow | null>;

  /**
   * Atomically rotates a refresh token: inserts the new token and marks the current one as rotated.
   * @param params - Current token ID and next token input.
   * @returns The newly inserted token row.
   */
  rotate(params: {
    currentTokenId: string;
    next: InsertRefreshTokenInput;
  }): Promise<StoredRefreshTokenRow>;

  /**
   * Revokes a single refresh token by its JTI.
   * @param jti - JWT ID of the token to revoke.
   */
  revokeByJti(jti: string): Promise<void>;

  /**
   * Deletes expired refresh tokens in a bounded batch.
   * @param limit - Maximum rows to delete per invocation.
   * @returns The number of rows actually deleted.
   */
  deleteExpiredTokens(limit?: number): Promise<number>;

  /**
   * Revokes all active refresh tokens for a user, optionally excluding one JTI.
   * Used after password change to invalidate all existing sessions.
   * @param userId - The user's ID.
   * @param excludeJti - Optional JTI to exclude (e.g. the current session).
   */
  revokeAllForUser(userId: number, excludeJti?: string): Promise<void>;

  /**
   * Revokes all tokens in a token family, optionally marking reuse detection.
   * @param familyId - Token family identifier.
   * @param reuseDetected - When `true`, also sets `reuseDetectedAt` on all family members.
   */
  revokeFamily(familyId: string, reuseDetected?: boolean): Promise<void>;
}
