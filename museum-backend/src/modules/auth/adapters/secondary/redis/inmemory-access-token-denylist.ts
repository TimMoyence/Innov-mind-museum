import type { IAccessTokenDenylist } from '@modules/auth/domain/session/access-token-denylist.port';

/**
 * No-op adapter for {@link IAccessTokenDenylist}. Used when Redis is absent
 * (dev w/o cache, unit tests not exercising revocation). Always returns `false`
 * on `has()` — no token is ever denylisted in this mode.
 *
 * Wired by `src/index.ts` when `env.cache?.enabled === false`. Mirrors the
 * `NoopCacheService` / `NoopLlmCostCounter` pattern (composition root opt-out).
 */
export class NoopAccessTokenDenylist implements IAccessTokenDenylist {
  add(_jti: string, _ttlSec: number): Promise<void> {
    return Promise.resolve();
  }

  has(_jti: string): Promise<boolean> {
    return Promise.resolve(false);
  }
}

/**
 * In-memory adapter — used by integration / unit tests that DO need the
 * denylist round-trip but don't want a Redis dependency.
 *
 * `lazy purge on has()` — expired entries dropped on read, no background cron.
 * Tests inject `now()` for deterministic TTL expiry simulation.
 */
export class InMemoryAccessTokenDenylist implements IAccessTokenDenylist {
  private readonly entries = new Map<string, number>(); // jti → expiresAtMs

  constructor(private readonly now: () => number = (): number => Date.now()) {}

  add(jti: string, ttlSec: number): Promise<void> {
    if (ttlSec <= 0) return Promise.resolve();
    this.entries.set(jti, this.now() + ttlSec * 1000);
    return Promise.resolve();
  }

  has(jti: string): Promise<boolean> {
    const expiresAt = this.entries.get(jti);
    if (expiresAt === undefined) return Promise.resolve(false);
    if (expiresAt <= this.now()) {
      this.entries.delete(jti);
      return Promise.resolve(false);
    }
    return Promise.resolve(true);
  }
}
