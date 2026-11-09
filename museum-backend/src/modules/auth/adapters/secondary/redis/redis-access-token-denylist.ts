import crypto from 'node:crypto';

import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';

import type { IAccessTokenDenylist } from '@modules/auth/domain/session/access-token-denylist.port';
import type Redis from 'ioredis';

const KEY_PREFIX = 'denylist:access:';
const WARN_EVENT = 'access_token_denylist_unavailable';
const WARN_RATE_LIMIT_MS = 60_000;

type WarnFn = (msg: string, ctx: Record<string, unknown>) => void;

interface RedisAccessTokenDenylistOpts {
  now?: () => number;
  warn?: WarnFn;
}

const jtiFingerprint = (jti: string): string => {
  return crypto.createHash('sha256').update(jti).digest('hex').slice(0, 8);
};

export class RedisAccessTokenDenylist implements IAccessTokenDenylist {
  private lastWarnAt: number | null = null;
  private readonly now: () => number;
  private readonly warn: WarnFn;

  constructor(
    private readonly redis: Redis,
    opts: RedisAccessTokenDenylistOpts = {},
  ) {
    this.now = opts.now ?? ((): number => Date.now());
    this.warn =
      opts.warn ??
      ((msg, ctx): void => {
        logger.warn(msg, ctx);
      });
  }

  async add(jti: string, ttlSec: number): Promise<void> {
    if (ttlSec <= 0) return;
    try {
      await this.redis.set(`${KEY_PREFIX}${jti}`, '1', 'EX', ttlSec, 'NX');
    } catch (err) {
      this.emitWarn(err, jti, 'add');
    }
  }

  async has(jti: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(`${KEY_PREFIX}${jti}`);
      return result === 1;
    } catch (err) {
      this.emitWarn(err, jti, 'has');
      return false;
    }
  }

  private emitWarn(err: unknown, jti: string, op: 'add' | 'has'): void {
    const nowMs = this.now();
    if (this.lastWarnAt !== null && nowMs - this.lastWarnAt < WARN_RATE_LIMIT_MS) {
      return;
    }
    this.lastWarnAt = nowMs;
    this.warn(WARN_EVENT, {
      op,
      jtiHashFirst8: jtiFingerprint(jti),
      error: errorMessage(err),
    });
  }
}
