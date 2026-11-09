import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { CacheService } from '@shared/cache/cache.port';

export interface IIdempotencyStore {
  remember<T>(key: string, producer: () => Promise<T>): Promise<T>;
}

let nowProvider: () => Date = () => new Date();

const RESULT_PREFIX = 'idempotency:result:';
const RESERVE_PREFIX = 'idempotency:reserve:';

const resultKey = (key: string): string => `${RESULT_PREFIX}${key}`;
const reserveKey = (key: string): string => `${RESERVE_PREFIX}${key}`;

const ttlMs = (): number => env.idempotencyTtlMs;
const ttlSec = (): number => Math.max(1, Math.floor(ttlMs() / 1000));

class InProcessIdempotencyStore implements IIdempotencyStore {
  private readonly results = new Map<string, { value: unknown; expiresAt: number }>();

  async remember<T>(key: string, producer: () => Promise<T>): Promise<T> {
    const k = resultKey(key);
    const existing = this.results.get(k);
    if (
      existing &&
      nowProvider().getTime() <= existing.expiresAt &&
      existing.value !== null &&
      existing.value !== undefined
    ) {
      return existing.value as T;
    }
    if (existing) this.results.delete(k);

    const value = await producer();
    this.results.set(k, { value, expiresAt: nowProvider().getTime() + ttlMs() });
    return value;
  }
}

class RedisIdempotencyStore implements IIdempotencyStore {
  constructor(private readonly cache: CacheService) {}

  private onFallback(op: string, error: unknown): void {
    logger.warn('idempotency_redis_fail_open', {
      op,
      error: errorMessage(error),
    });
  }

  async remember<T>(key: string, producer: () => Promise<T>): Promise<T> {
    try {
      const stored = await this.cache.get<T>(resultKey(key));
      if (stored !== null) return stored;
    } catch (error) {
      this.onFallback('get', error);
    }

    try {
      await this.cache.setNx(reserveKey(key), 1, ttlSec());
    } catch (error) {
      this.onFallback('setNx', error);
    }

    const value = await producer();

    try {
      await this.cache.set(resultKey(key), value, ttlSec());
    } catch (error) {
      this.onFallback('set', error);
    }

    return value;
  }
}

let store: IIdempotencyStore | null = null;

export function configureIdempotency(deps: { cache?: CacheService }): void {
  store = deps.cache ? new RedisIdempotencyStore(deps.cache) : new InProcessIdempotencyStore();
}

function ensureStore(): IIdempotencyStore {
  store ??= new InProcessIdempotencyStore();
  return store;
}

export const remember = async <T>(key: string, producer: () => Promise<T>): Promise<T> => {
  return await ensureStore().remember(key, producer);
};

export const __setNowForTest = (date: Date | undefined): void => {
  nowProvider = date ? () => date : () => new Date();
};

export const __setIdempotencyStoreForTest = (next: IIdempotencyStore | null): void => {
  store = next;
};
