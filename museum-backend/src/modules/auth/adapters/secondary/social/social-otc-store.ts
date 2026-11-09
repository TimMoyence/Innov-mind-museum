import crypto from 'node:crypto';

import { toPositiveInt } from '@src/config/env-helpers';

import type { SocialOtcStore } from '@modules/auth/domain/ports/social-otc-store.port';
import type Redis from 'ioredis';
import type { ZodType } from 'zod';

const OTC_BYTES = 16;
const KEY_PREFIX = 'oidc:otc:';

const generateCode = (): string => crypto.randomBytes(OTC_BYTES).toString('base64url');

const resolveTtlSeconds = (override?: number): number =>
  override !== undefined && override > 0
    ? override
    : toPositiveInt(process.env.SOCIAL_OTC_TTL_SECONDS, 60);

interface InMemoryOptions {
  ttlSeconds?: number;
  now?: () => number;
}

interface InMemoryEntry<TPayload> {
  payload: TPayload;
  expiresAt: number;
}

export class InMemorySocialOtcStore<TPayload> implements SocialOtcStore<TPayload> {
  private readonly entries = new Map<string, InMemoryEntry<TPayload>>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(options: InMemoryOptions = {}) {
    this.ttlMs = resolveTtlSeconds(options.ttlSeconds) * 1000;
    this.now = options.now ?? Date.now;
  }

  issue(payload: TPayload): Promise<string> {
    const code = generateCode();
    this.entries.set(code, { payload, expiresAt: this.now() + this.ttlMs });
    return Promise.resolve(code);
  }

  consume(code: string): Promise<TPayload | null> {
    const entry = this.entries.get(code);
    if (entry === undefined) return Promise.resolve(null);
    this.entries.delete(code);
    if (entry.expiresAt <= this.now()) return Promise.resolve(null);
    return Promise.resolve(entry.payload);
  }

  clear(): void {
    this.entries.clear();
  }
}

export class RedisSocialOtcStore<TPayload> implements SocialOtcStore<TPayload> {
  private readonly redis: Redis;
  private readonly ttlSeconds: number;
  private readonly schema: ZodType<TPayload>;
  private readonly fallback: InMemorySocialOtcStore<TPayload>;

  constructor(redis: Redis, options: { ttlSeconds?: number; schema: ZodType<TPayload> }) {
    this.redis = redis;
    this.ttlSeconds = resolveTtlSeconds(options.ttlSeconds);
    this.schema = options.schema;
    this.fallback = new InMemorySocialOtcStore<TPayload>({ ttlSeconds: this.ttlSeconds });
  }

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

  async consume(code: string): Promise<TPayload | null> {
    const key = `${KEY_PREFIX}${code}`;
    try {
      const value = await this.redis.getdel(key);
      if (value !== null) {
        const parsed = this.schema.safeParse(JSON.parse(value) as unknown);
        if (parsed.success) return parsed.data;
        return await this.fallback.consume(code);
      }
      return await this.fallback.consume(code);
    } catch {
      return await this.fallback.consume(code);
    }
  }
}

export const createSocialOtcStore = <TPayload>(options: {
  redis?: Redis;
  schema: ZodType<TPayload>;
}): SocialOtcStore<TPayload> => {
  if (options.redis) {
    return new RedisSocialOtcStore<TPayload>(options.redis, { schema: options.schema });
  }
  return new InMemorySocialOtcStore<TPayload>();
};
