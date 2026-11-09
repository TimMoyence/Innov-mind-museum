export interface StoredRefreshTokenRow {
  id: string;
  userId: number;
  jti: string;
  familyId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  rotatedAt: Date | null;
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
  lastRotatedAt?: Date;
}

export interface IRefreshTokenRepository {
  insert(input: InsertRefreshTokenInput): Promise<StoredRefreshTokenRow>;

  findByJti(jti: string): Promise<StoredRefreshTokenRow | null>;

  rotate(params: {
    currentTokenId: string;
    next: InsertRefreshTokenInput;
  }): Promise<StoredRefreshTokenRow>;

  revokeByJti(jti: string): Promise<void>;

  deleteExpiredTokens(limit?: number): Promise<number>;

  revokeAllForUser(userId: number, excludeJti?: string): Promise<void>;

  revokeFamily(familyId: string, reuseDetected?: boolean): Promise<void>;
}
