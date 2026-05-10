/**
 * F11-mobile (2026-05) — One-time-code (OTC) store implementations.
 *
 * Two adapters wired behind the {@link SocialOtcStore} port:
 *   - {@link RedisSocialOtcStore} — production. Uses `SET … EX … NX` for
 *     issue (atomic create-if-absent) and `GETDEL` for consume (atomic
 *     read+delete). Both Redis primitives are race-free across replicas.
 *   - {@link InMemorySocialOtcStore} — dev / test fallback. Single-process
 *     `Map<string, { payload, expiresAt }>` with lazy cleanup on consume.
 *
 * Default TTL is 60 s (env `SOCIAL_OTC_TTL_SECONDS`). Intentionally short:
 * the window MUST cover the round-trip from /google/callback redirect to the
 * client's POST /social-redeem, but not so wide that a leaked deeplink is
 * usable indefinitely.
 *
 * Entropy: `crypto.randomBytes(16)` → 128 bits, base64url-encoded (22 chars).
 */
import crypto from 'node:crypto';

import { env } from '@src/config/env';

import type { SocialOtcStore } from '@modules/auth/domain/ports/social-otc-store.port';
import type Redis from 'ioredis';

const OTC_BYTES = 16; // 128 bits — same floor as nonce store.
const KEY_PREFIX = 'oidc:otc:';

const generateCode = (): string => crypto.randomBytes(OTC_BYTES).toString('base64url');

/** Resolved TTL (seconds) honoured by every store impl. */
const resolveTtlSeconds = (override?: number): number => {
  if (override !== undefined && override > 0) return override;
  const raw = process.env.SOCIAL_OTC_TTL_SECONDS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60;
};

interface InMemoryOptions {
  /** TTL override (seconds). Defaults to env `SOCIAL_OTC_TTL_SECONDS`. */
  ttlSeconds?: number;
  /** Wall-clock injection point for deterministic tests. */
  now?: () => number;
}

interface InMemoryEntry<TPayload> {
  payload: TPayload;
  expiresAt: number;
}

/**
 * Single-process OTC store. Used in dev / tests when no Redis is wired.
 *
 * Not safe across replicas — production deployments running multi-instance
 * MUST wire {@link RedisSocialOtcStore} so a code issued on instance A is
 * also consumable on instance B (and atomically rejected when consumed
 * elsewhere).
 */
export class InMemorySocialOtcStore<TPayload> implements SocialOtcStore<TPayload> {
  private readonly entries = new Map<string, InMemoryEntry<TPayload>>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: InMemoryOptions = {}) {
    this.ttlMs = resolveTtlSeconds(options.ttlSeconds) * 1000;
    this.now = options.now ?? Date.now;
  }

  /** Issue a fresh OTC bound to {@link payload} with the configured TTL. */
  issue(payload: TPayload): Promise<string> {
    const code = generateCode();
    this.entries.set(code, { payload, expiresAt: this.now() + this.ttlMs });
    return Promise.resolve(code);
  }

  /** Atomically delete the stored entry and return its payload (single-use). */
  consume(code: string): Promise<TPayload | null> {
    const entry = this.entries.get(code);
    if (entry === undefined) return Promise.resolve(null);
    // Always delete (single-use, even if expired).
    this.entries.delete(code);
    if (entry.expiresAt <= this.now()) return Promise.resolve(null);
    return Promise.resolve(entry.payload);
  }

  /** Test helper — drops every stored code. */
  clear(): void {
    this.entries.clear();
  }
}

/**
 * Redis-backed OTC store for multi-instance deployments. Issue serializes the
 * payload with `JSON.stringify`, consume runs `GETDEL` (atomic read+delete,
 * Redis ≥6.2). Falls back silently to the in-memory store on Redis I/O errors
 * so a transient outage degrades to single-instance correctness rather than
 * breaking every social login.
 */
export class RedisSocialOtcStore<TPayload> implements SocialOtcStore<TPayload> {
  private readonly redis: Redis;
  private readonly ttlSeconds: number;
  private readonly fallback: InMemorySocialOtcStore<TPayload>;

  constructor(redis: Redis, options: { ttlSeconds?: number } = {}) {
    this.redis = redis;
    this.ttlSeconds = resolveTtlSeconds(options.ttlSeconds);
    this.fallback = new InMemorySocialOtcStore<TPayload>({ ttlSeconds: this.ttlSeconds });
  }

  /** Issue a fresh OTC keyed in Redis (with in-memory fallback on I/O errors). */
  async issue(payload: TPayload): Promise<string> {
    const code = generateCode();
    const key = `${KEY_PREFIX}${code}`;
    try {
      await this.redis.set(key, JSON.stringify(payload), 'EX', this.ttlSeconds, 'NX');
      return code;
    } catch {
      return await this.fallback.issue(payload);
    }
  }

  /** Atomic GETDEL — single-use, falls through to in-memory on Redis errors. */
  async consume(code: string): Promise<TPayload | null> {
    const key = `${KEY_PREFIX}${code}`;
    try {
      const value = await this.redis.getdel(key);
      if (value !== null) {
        return JSON.parse(value) as TPayload;
      }
      return await this.fallback.consume(code);
    } catch {
      return await this.fallback.consume(code);
    }
  }
}

/**
 * Convenience builder used by the auth composition root. Picks the Redis
 * adapter when a {@link Redis} client is provided, otherwise the in-memory
 * fallback.
 */
export const createSocialOtcStore = <TPayload>(redis?: Redis): SocialOtcStore<TPayload> => {
  void env; // participate in config-load ordering, mirrors nonce-store.
  if (redis) {
    return new RedisSocialOtcStore<TPayload>(redis);
  }
  return new InMemorySocialOtcStore<TPayload>();
};
