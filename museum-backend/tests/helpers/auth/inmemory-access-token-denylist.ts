import type { IAccessTokenDenylist } from '@modules/auth/domain/session/access-token-denylist.port';

export class InMemoryAccessTokenDenylist implements IAccessTokenDenylist {
  private readonly entries = new Map<string, number>();

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
