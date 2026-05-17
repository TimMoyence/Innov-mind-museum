/** Row shape for `auth_refresh_tokens`. */
export interface StoredRefreshTokenRow {
  id: string;
  userId: number;
  jti: string;
  familyId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  rotatedAt: Date | null;
  /**
   * Last rotation activity on the session chain (sliding idle-window check).
   * `null` on legacy rows predating the column; consumers should fall back
   * to `createdAt` / `issuedAt`.
   */
  lastRotatedAt: Date | null;
  revokedAt: Date | null;
  reuseDetectedAt: Date | null;
  replacedByTokenId: string | null;
  createdAt: Date;
}

export interface InsertRefreshTokenInput {
  userId: number;
  jti: string;
  familyId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  /** Defaults to `issuedAt` (fresh login) — deterministic anchor for sliding window. */
  lastRotatedAt?: Date;
}

/** Port for refresh-token lifecycle. Implemented by {@link RefreshTokenRepositoryPg}. */
export interface IRefreshTokenRepository {
  insert(input: InsertRefreshTokenInput): Promise<StoredRefreshTokenRow>;

  findByJti(jti: string): Promise<StoredRefreshTokenRow | null>;

  /** Atomic — inserts the new token and marks `currentTokenId` as rotated. */
  rotate(params: {
    currentTokenId: string;
    next: InsertRefreshTokenInput;
  }): Promise<StoredRefreshTokenRow>;

  revokeByJti(jti: string): Promise<void>;

  /** @returns rows actually deleted. */
  deleteExpiredTokens(limit?: number): Promise<number>;

  /** Used after password change to invalidate all existing sessions. */
  revokeAllForUser(userId: number, excludeJti?: string): Promise<void>;

  /** `reuseDetected=true` also sets `reuseDetectedAt` on all family members. */
  revokeFamily(familyId: string, reuseDetected?: boolean): Promise<void>;
}
