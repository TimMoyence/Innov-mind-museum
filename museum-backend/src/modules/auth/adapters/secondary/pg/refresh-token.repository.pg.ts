import { AuthRefreshToken } from '@modules/auth/domain/refresh-token/authRefreshToken.entity';

import type {
  IRefreshTokenRepository,
  StoredRefreshTokenRow,
  InsertRefreshTokenInput,
} from '@modules/auth/domain/refresh-token/refresh-token.repository.interface';
import type { DataSource, Repository } from 'typeorm';

// Re-exported for legacy consumers.
export type {
  StoredRefreshTokenRow,
  InsertRefreshTokenInput,
} from '@modules/auth/domain/refresh-token/refresh-token.repository.interface';

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

export class RefreshTokenRepositoryPg implements IRefreshTokenRepository {
  private readonly repo: Repository<AuthRefreshToken>;
  private readonly dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
    this.repo = dataSource.getRepository(AuthRefreshToken);
  }

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

  async findByJti(jti: string): Promise<StoredRefreshTokenRow | null> {
    const entity = await this.repo.findOne({ where: { jti }, relations: { user: true } });
    return entity ? toRow(entity) : null;
  }

  /** Atomic — inserts new + marks current rotated. */
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

  async revokeByJti(jti: string): Promise<void> {
    await this.repo
      .createQueryBuilder()
      .update(AuthRefreshToken)
      .set({ revokedAt: () => 'COALESCE("revokedAt", NOW())' })
      .where('jti = :jti', { jti })
      .execute();
  }

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

  /** Used after password change to invalidate all existing sessions. */
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

  /** `reuseDetected=true` also sets `reuseDetectedAt` on all family members. */
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
