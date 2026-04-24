import { AuthRefreshToken } from '../../domain/authRefreshToken.entity';

import type {
  IRefreshTokenRepository,
  StoredRefreshTokenRow,
  InsertRefreshTokenInput,
} from '../../domain/refresh-token.repository.interface';
import type { DataSource, Repository } from 'typeorm';

// Re-export domain types so existing consumers that imported from here keep working
export type {
  StoredRefreshTokenRow,
  InsertRefreshTokenInput,
} from '../../domain/refresh-token.repository.interface';

/** Convert an AuthRefreshToken entity to a StoredRefreshTokenRow DTO. */
function toRow(entity: AuthRefreshToken): StoredRefreshTokenRow {
  const fallbackUserId = (entity as AuthRefreshToken & { userId?: number }).userId;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- TypeORM relation may not be loaded at runtime
  const userId = entity.user ? entity.user.id : fallbackUserId;
  if (typeof userId !== 'number') {
    throw new Error('Refresh token row is missing userId');
  }

  return {
    id: entity.id,
    userId,
    jti: entity.jti,
    familyId: entity.familyId,
    tokenHash: entity.tokenHash,
    issuedAt: entity.issuedAt,
    expiresAt: entity.expiresAt,
    rotatedAt: entity.rotatedAt ?? null,
    lastRotatedAt: entity.lastRotatedAt ?? null,
    revokedAt: entity.revokedAt ?? null,
    reuseDetectedAt: entity.reuseDetectedAt ?? null,
    replacedByTokenId: entity.replacedByTokenId ?? null,
    createdAt: entity.createdAt,
  };
}

/** TypeORM repository for refresh-token lifecycle management. */
export class RefreshTokenRepositoryPg implements IRefreshTokenRepository {
  private readonly repo: Repository<AuthRefreshToken>;
  private readonly dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
    this.repo = dataSource.getRepository(AuthRefreshToken);
  }

  /**
   * Inserts a new refresh token row.
   *
   * @param input - Token metadata (userId, jti, familyId, hash, dates).
   * @returns The inserted row.
   */
  async insert(input: InsertRefreshTokenInput): Promise<StoredRefreshTokenRow> {
    const entity = this.repo.create({
      user: { id: input.userId } as AuthRefreshToken['user'],
      jti: input.jti,
      familyId: input.familyId,
      tokenHash: input.tokenHash,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      lastRotatedAt: input.lastRotatedAt ?? input.issuedAt,
    });

    const saved = await this.repo.save(entity);
    return toRow(saved);
  }

  /**
   * Finds a refresh token by its JTI claim.
   *
   * @param jti - JWT ID.
   * @returns The token row or `null`.
   */
  async findByJti(jti: string): Promise<StoredRefreshTokenRow | null> {
    const entity = await this.repo.findOne({ where: { jti }, relations: { user: true } });
    return entity ? toRow(entity) : null;
  }

  /**
   * Atomically rotates a refresh token: inserts the new token and marks the current one as rotated.
   *
   * @param params - Current token ID and next token input.
   * @param params.currentTokenId - ID of the token being rotated out.
   * @param params.next - Input data for the replacement token.
   * @returns The newly inserted token row.
   */
  async rotate(params: {
    currentTokenId: string;
    next: InsertRefreshTokenInput;
  }): Promise<StoredRefreshTokenRow> {
    return await this.dataSource.transaction(async (manager) => {
      const tokenRepo = manager.getRepository(AuthRefreshToken);

      const entity = tokenRepo.create({
        user: { id: params.next.userId } as AuthRefreshToken['user'],
        jti: params.next.jti,
        familyId: params.next.familyId,
        tokenHash: params.next.tokenHash,
        issuedAt: params.next.issuedAt,
        expiresAt: params.next.expiresAt,
        lastRotatedAt: params.next.lastRotatedAt ?? params.next.issuedAt,
      });

      const saved = await tokenRepo.save(entity);
      const nextRow = toRow(saved);

      await tokenRepo.update(params.currentTokenId, {
        rotatedAt: new Date(),
        replacedByTokenId: nextRow.id,
      });

      return nextRow;
    });
  }

  /**
   * Revokes a single refresh token by its JTI.
   *
   * @param jti - JWT ID of the token to revoke.
   */
  async revokeByJti(jti: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(AuthRefreshToken)
      .set({ revokedAt: () => 'COALESCE("revokedAt", NOW())' })
      .where('jti = :jti', { jti })
      .execute();
  }

  /**
   * Deletes expired refresh tokens in a bounded batch.
   *
   * @param limit - Maximum rows to delete per invocation.
   * @returns The number of rows actually deleted.
   */
  async deleteExpiredTokens(limit = 10000): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .from(AuthRefreshToken)
      .where(
        'id IN (SELECT id FROM "auth_refresh_tokens" WHERE "expiresAt" < NOW() LIMIT :limit)',
        { limit },
      )
      .execute();

    return result.affected ?? 0;
  }

  /**
   * Revokes all active refresh tokens for a user, optionally excluding one JTI.
   * Used after password change to invalidate all existing sessions.
   *
   * @param userId - The user's ID.
   * @param excludeJti - Optional JTI to exclude (e.g. the current session).
   */
  async revokeAllForUser(userId: number, excludeJti?: string): Promise<void> {
    const qb = this.repo
      .createQueryBuilder()
      .update(AuthRefreshToken)
      .set({ revokedAt: new Date() })
      .where('"userId" = :userId AND "revokedAt" IS NULL', { userId });

    if (excludeJti) {
      qb.andWhere('jti != :excludeJti', { excludeJti });
    }

    await qb.execute();
  }

  /**
   * Revokes all tokens in a token family, optionally marking reuse detection.
   *
   * @param familyId - Token family identifier.
   * @param reuseDetected - When `true`, also sets `reuseDetectedAt` on all family members.
   */
  async revokeFamily(familyId: string, reuseDetected = false): Promise<void> {
    await (reuseDetected
      ? this.repo
          .createQueryBuilder()
          .update(AuthRefreshToken)
          .set({
            revokedAt: () => 'COALESCE("revokedAt", NOW())',
            reuseDetectedAt: () => 'COALESCE("reuseDetectedAt", NOW())',
          })
          .where('"familyId" = :familyId', { familyId })
          .execute()
      : this.repo
          .createQueryBuilder()
          .update(AuthRefreshToken)
          .set({
            revokedAt: () => 'COALESCE("revokedAt", NOW())',
          })
          .where('"familyId" = :familyId', { familyId })
          .execute());
  }
}
