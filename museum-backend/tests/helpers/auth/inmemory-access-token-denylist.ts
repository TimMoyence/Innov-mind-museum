import type { IAccessTokenDenylist } from '@modules/auth/domain/session/access-token-denylist.port';

/**
 * In-memory test double for {@link IAccessTokenDenylist}.
 *
 * Production now uses the Redis adapter behind the port (dev refactor:
 * `redis-access-token-denylist.ts`); this in-memory variant is test-only —
 * unit tests that need the denylist round-trip without a Redis dependency.
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
