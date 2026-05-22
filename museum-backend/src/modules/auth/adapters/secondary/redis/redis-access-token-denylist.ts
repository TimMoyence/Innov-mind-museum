import crypto from 'node:crypto';

import { logger } from '@shared/logger/logger';

import type { IAccessTokenDenylist } from '@modules/auth/domain/session/access-token-denylist.port';
import type Redis from 'ioredis';

const KEY_PREFIX = 'denylist:access:';
const WARN_EVENT = 'access_token_denylist_unavailable';
const WARN_RATE_LIMIT_MS = 60_000; // 1 minute

type WarnFn = (msg: string, ctx: Record<string, unknown>) => void;

interface RedisAccessTokenDenylistOpts {
  /** Injected for tests — defaults to `Date.now`. Returns ms since epoch. */
  now?: () => number;
  /** Injected logger fork for tests — defaults to project `logger.warn`. */
  warn?: WarnFn;
}

const jtiFingerprint = (jti: string): string => {
  // First 8 hex chars of SHA-256(jti) — opaque, non-reversible, NOT the jti itself.
  // Design §10 logs : "champs structured : `{event, err.message, jti_hash_first8}`
  // (jamais le jti complet pour éviter PII-ish enumeration)".
  return crypto.createHash('sha256').update(jti).digest('hex').slice(0, 8);
};

/**
 * Redis adapter for {@link IAccessTokenDenylist}.
 *
 * Spec : team-state/2026-05-21-p0-c3-auth-crypto/spec.md §R7-R9.
 * Design : team-state/2026-05-21-p0-c3-auth-crypto/design.md §3.1 + D9.
 *
 * lib-docs/ioredis/PATTERNS.md §3 DO #6 — `SET ... EX ... NX` atomic write
 * (no separate `EXPIRE` race ; NX prevents resetting an existing entry's TTL).
 *
 * Fail-OPEN on backing-store failure (R9) — denylist is defense-in-depth, NOT
 * the primary identity layer. A Redis outage MUST NOT convert into a global
 * auth outage. The trade-off is documented in spec §5 NFR + design §9 D9.
 *
 * Warn log rate-limited to 1 / minute via in-memory `lastWarnAt` token bucket
 * to avoid flooding logs during a reconnect storm.
 */
export class RedisAccessTokenDenylist implements IAccessTokenDenylist {
  /**
   * `null` sentinel = "never warned yet". Distinct from epoch=0 so the first
   * failure always fires (tests inject `now: () => 0` for determinism).
   */
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
    // R7 — `ttlSec <= 0` means the access token has already expired naturally.
    // Burning a Redis entry with negative TTL is pointless ; silent no-op.
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
      // Fail-OPEN — defense-in-depth layer ; primary identity (JWT exp +
      // refresh rotation) still gates. Spec §R9 + design §9 D9.
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
      // First-8 SHA-256 hex — PII-ish enumeration defense (design §10 logs).
      jtiHashFirst8: jtiFingerprint(jti),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
