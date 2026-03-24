import { TokenCleanupService } from '@modules/auth/core/useCase/tokenCleanup.service';
import type { IRefreshTokenRepository } from '@modules/auth/core/domain/refresh-token.repository.interface';

const makeRefreshTokenRepo = (deleteResult = 5) => ({
  deleteExpiredTokens: jest.fn().mockResolvedValue(deleteResult),
});

const makeCacheService = (setNxResult = true) => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  delByPrefix: jest.fn(),
  setNx: jest.fn().mockResolvedValue(setNxResult),
});

describe('TokenCleanupService', () => {
  it('runs cleanup when lock is acquired (setNx returns true)', async () => {
    const repo = makeRefreshTokenRepo(42);
    const cache = makeCacheService(true);
    const service = new TokenCleanupService(repo as unknown as IRefreshTokenRepository, cache);

    const deleted = await service.runCleanup();

    expect(cache.setNx).toHaveBeenCalledWith('token-cleanup:lock', true, 300);
    expect(repo.deleteExpiredTokens).toHaveBeenCalledWith(10000);
    expect(deleted).toBe(42);
  });

  it('skips cleanup when lock is held (setNx returns false)', async () => {
    const repo = makeRefreshTokenRepo();
    const cache = makeCacheService(false);
    const service = new TokenCleanupService(repo as unknown as IRefreshTokenRepository, cache);

    const deleted = await service.runCleanup();

    expect(cache.setNx).toHaveBeenCalled();
    expect(repo.deleteExpiredTokens).not.toHaveBeenCalled();
    expect(deleted).toBe(0);
  });

  it('runs cleanup without cache (no lock)', async () => {
    const repo = makeRefreshTokenRepo(10);
    const service = new TokenCleanupService(repo as unknown as IRefreshTokenRepository, undefined);

    const deleted = await service.runCleanup();

    expect(repo.deleteExpiredTokens).toHaveBeenCalledWith(10000);
    expect(deleted).toBe(10);
  });

  it('returns 0 and does not throw if deleteExpiredTokens fails', async () => {
    const repo = makeRefreshTokenRepo();
    repo.deleteExpiredTokens.mockRejectedValue(new Error('DB down'));
    const service = new TokenCleanupService(repo as unknown as IRefreshTokenRepository, undefined);

    const deleted = await service.runCleanup();
    expect(deleted).toBe(0);
  });
});
