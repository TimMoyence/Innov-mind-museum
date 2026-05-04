/**
 * F3 — OIDC nonce store implementations.
 *
 * Two adapters wired behind the {@link NonceStore} port:
 *   - {@link RedisNonceStore} — production. Uses `SET … EX … NX` for issue
 *     (atomic create-if-absent) and `GETDEL` for consume (atomic
 *     read+delete). Both Redis primitives are race-free across replicas.
 *   - {@link InMemoryNonceStore} — dev / test fallback. Single-process
 *     `Map<string, expiresAt>` with lazy cleanup on consume.
 *
 * TTL defaults to 300 s (env `SOCIAL_NONCE_TTL_SECONDS`). The window is
 * intentionally short: it MUST cover round-trip from `/social-nonce` issue to
 * `/social-login` submission but not so wide that a stolen client-side token
 * is replayable indefinitely.
 *
 * Entropy: `crypto.randomBytes(16)` → 128 bits, base64url-encoded (22 chars).
 * 128 bits is the OIDC-recommended floor against birthday collisions across a
 * realistic deployment.
 */
import crypto from 'node:crypto';

import { env } from '@src/config/env';

import type { NonceStore } from '../../../domain/ports/nonce-store.port';
import type Redis from 'ioredis';

const NONCE_BYTES = 16; // 128 bits — OIDC recommended floor.
const KEY_PREFIX = 'oidc:nonce:';

const generateNonce = (): string => crypto.randomBytes(NONCE_BYTES).toString('base64url');

/** Resolved TTL (seconds) honoured by every store impl. */
const resolveTtlSeconds = (override?: number): number => {
  if (override !== undefined && override > 0) return override;
  const raw = process.env.SOCIAL_NONCE_TTL_SECONDS;
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 300;
};

interface InMemoryOptions {
  /** TTL override (seconds). Defaults to env `SOCIAL_NONCE_TTL_SECONDS`. */
  ttlSeconds?: number;
  /** Wall-clock injection point for deterministic tests. */
  now?: () => number;
}

/**
 * Single-process nonce store. Used in dev / tests when no Redis is wired.
 *
 * Not safe across replicas — production deployments running multi-instance
 * MUST wire {@link RedisNonceStore} so a nonce issued on instance A is also
 * consumable on instance B (and atomically rejected when consumed elsewhere).
 */
export class InMemoryNonceStore implements NonceStore {
  private readonly entries = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: InMemoryOptions = {}) {
    this.ttlMs = resolveTtlSeconds(options.ttlSeconds) * 1000;
    this.now = options.now ?? Date.now;
  }

  /** Issue a fresh nonce with the configured TTL. */
  issue(): Promise<string> {
    const nonce = generateNonce();
    this.entries.set(nonce, this.now() + this.ttlMs);
    return Promise.resolve(nonce);
  }

  /** Atomically delete the stored nonce. Returns true only if it was present and unexpired. */
  consume(nonce: string): Promise<boolean> {
    const expiresAt = this.entries.get(nonce);
    if (expiresAt === undefined) return Promise.resolve(false);
    // Always delete (single-use, even if expired).
    this.entries.delete(nonce);
    return Promise.resolve(expiresAt > this.now());
  }

  /** Test helper — drops every stored nonce. */
  clear(): void {
    this.entries.clear();
  }
}

/**
 * Redis-backed nonce store for multi-instance deployments. Both `issue` and
 * `consume` rely on Redis primitives that are atomic on the server side, so
 * concurrent consumers from different replicas cannot both succeed.
 *
 * Falls back silently to the in-memory store on Redis I/O errors so that an
 * intermittent Redis blip degrades to single-instance correctness rather than
 * blocking every social login. (Defence-in-depth: the verifier still asserts
 * the JWT claim against the same server-issued nonce.)
 */
export class RedisNonceStore implements NonceStore {
  private readonly redis: Redis;
  private readonly ttlSeconds: number;
  private readonly fallback: InMemoryNonceStore;

  constructor(redis: Redis, options: { ttlSeconds?: number } = {}) {
    this.redis = redis;
    this.ttlSeconds = resolveTtlSeconds(options.ttlSeconds);
    this.fallback = new InMemoryNonceStore({ ttlSeconds: this.ttlSeconds });
  }

  /** Issue a fresh nonce with the configured TTL via SET … EX … NX. */
  async issue(): Promise<string> {
    const nonce = generateNonce();
    const key = `${KEY_PREFIX}${nonce}`;
    try {
      // SET … NX ensures we never overwrite a colliding entry (probability
      // is 2^-128 but the guard is free).
      await this.redis.set(key, '1', 'EX', this.ttlSeconds, 'NX');
      return nonce;
    } catch {
      return await this.fallback.issue();
    }
  }

  /** Atomic GETDEL — true only when the nonce existed at the moment of consumption. */
  async consume(nonce: string): Promise<boolean> {
    const key = `${KEY_PREFIX}${nonce}`;
    try {
      // GETDEL is the canonical atomic read-and-delete (Redis ≥6.2). Returns
      // `null` when the key never existed or already expired.
      const redisWithGetdel = this.redis as unknown as {
        getdel: (k: string) => Promise<string | null>;
      };
      const value = await redisWithGetdel.getdel(key);
      if (value !== null) return true;
      // Try fallback in case the nonce was issued via the in-memory path
      // during a transient Redis outage.
      return await this.fallback.consume(nonce);
    } catch {
      return await this.fallback.consume(nonce);
    }
  }
}

/**
 * Convenience builder used by the auth composition root. Picks the Redis
 * adapter when a {@link Redis} client is provided, otherwise the in-memory
 * fallback. The TTL is read from `env` (`SOCIAL_NONCE_TTL_SECONDS`) so a
 * single env var controls both adapters.
 */
export const createNonceStore = (redis?: Redis): NonceStore => {
  // env import keeps the implementation honest if a future migration reroutes
  // the TTL through `env.auth`. Today we only read it via `process.env`, but
  // referencing `env` ensures the module participates in the config-load
  // ordering so a missing env loader can never hand us undefined behaviour.
  void env;
  if (redis) {
    return new RedisNonceStore(redis);
  }
  return new InMemoryNonceStore();
};
