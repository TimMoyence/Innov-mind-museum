import crypto from 'node:crypto';

import { toPositiveInt } from '@src/config/env-helpers';

import type { NonceStore } from '@modules/auth/domain/ports/nonce-store.port';
import type Redis from 'ioredis';

const NONCE_BYTES = 16;
const KEY_PREFIX = 'oidc:nonce:';

const generateNonce = (): string => crypto.randomBytes(NONCE_BYTES).toString('base64url');

const resolveTtlSeconds = (override?: number): number =>
  override !== undefined && override > 0
    ? override
    : toPositiveInt(process.env.SOCIAL_NONCE_TTL_SECONDS, 300);

interface InMemoryOptions {
  ttlSeconds?: number;
  now?: () => number;
}

export class InMemoryNonceStore implements NonceStore {
  private readonly entries = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: InMemoryOptions = {}) {
    this.ttlMs = resolveTtlSeconds(options.ttlSeconds) * 1000;
    this.now = options.now ?? Date.now;
  }

  issue(): Promise<string> {
    const nonce = generateNonce();
    this.entries.set(nonce, this.now() + this.ttlMs);
    return Promise.resolve(nonce);
  }

  consume(nonce: string): Promise<boolean> {
    const expiresAt = this.entries.get(nonce);
    if (expiresAt === undefined) return Promise.resolve(false);
    this.entries.delete(nonce);
    return Promise.resolve(expiresAt > this.now());
  }

  clear(): void {
    this.entries.clear();
  }
}

export class RedisNonceStore implements NonceStore {
  private readonly redis: Redis;
  private readonly ttlSeconds: number;
  private readonly fallback: InMemoryNonceStore;

  constructor(redis: Redis, options: { ttlSeconds?: number } = {}) {
    this.redis = redis;
    this.ttlSeconds = resolveTtlSeconds(options.ttlSeconds);
    this.fallback = new InMemoryNonceStore({ ttlSeconds: this.ttlSeconds });
  }

  async issue(): Promise<string> {
    const nonce = generateNonce();
    const key = `${KEY_PREFIX}${nonce}`;
    try {
      await this.redis.set(key, '1', 'EX', this.ttlSeconds, 'NX');
      return nonce;
    } catch {
      return await this.fallback.issue();
    }
  }

  async consume(nonce: string): Promise<boolean> {
    const key = `${KEY_PREFIX}${nonce}`;
    try {
      const value = await this.redis.getdel(key);
      if (value !== null) return true;
      return await this.fallback.consume(nonce);
    } catch {
      return await this.fallback.consume(nonce);
    }
  }
}

export const createNonceStore = (redis?: Redis): NonceStore => {
  if (redis) {
    return new RedisNonceStore(redis);
  }
  return new InMemoryNonceStore();
};

class DelegatingNonceStore implements NonceStore {
  private inner: NonceStore = new InMemoryNonceStore();
  setDelegate(store: NonceStore): void {
    this.inner = store;
  }
  issue(): Promise<string> {
    return this.inner.issue();
  }
  consume(nonce: string): Promise<boolean> {
    return this.inner.consume(nonce);
  }
}

const delegatingNonceStore = new DelegatingNonceStore();

export const socialNonceStore: NonceStore = delegatingNonceStore;

export const setSocialNonceStore = (store: NonceStore): void => {
  delegatingNonceStore.setDelegate(store);
};
