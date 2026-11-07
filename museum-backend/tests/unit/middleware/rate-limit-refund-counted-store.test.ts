import express from 'express';
import request from 'supertest';
import { z } from 'zod';

import { errorHandler } from '@shared/middleware/error.middleware';
import {
  _resetRedisStore,
  clearRateLimitBuckets,
  createRateLimitMiddleware,
  setRedisRateLimitStore,
  stopRateLimitSweep,
} from '@shared/middleware/rate-limit.middleware';
import { RedisRateLimitStore } from '@shared/middleware/redis-rate-limit-store';
import { validateBody } from '@shared/middleware/validate-body.middleware';

import type Redis from 'ioredis';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const evalScript = jest.fn<Promise<unknown>, [string, ...unknown[]]>();
const redisStore = new RedisRateLimitStore({
  eval: evalScript,
  del: jest.fn(async () => 1),
} as unknown as Redis);

const app = express()
  .use(express.json())
  .post(
    '/form',
    createRateLimitMiddleware({ limit: 1, windowMs: 60_000, keyGenerator: () => 'visitor' }),
    validateBody(z.object({ email: z.string() })),
    (_req, res) => {
      res.status(201).end();
    },
  )
  .use(errorHandler);

const statusesOf = async (times: number): Promise<number[]> => {
  const statuses: number[] = [];
  for (let attempt = 0; attempt < times; attempt += 1) {
    statuses.push((await request(app).post('/form').send({ email: 42 })).status);
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  return statuses;
};

describe('limites — le remboursement vise le compteur qui a compté l’unité', () => {
  beforeEach(() => {
    evalScript.mockReset();
    redisStore.clear();
    clearRateLimitBuckets();
    setRedisRateLimitStore(redisStore);
  });

  afterAll(() => {
    _resetRedisStore();
    stopRateLimitSweep();
  });

  it('QUOTA · une unité comptée en mémoire pendant une panne Redis est rendue à la mémoire, pas à Redis revenu', async () => {
    evalScript.mockImplementation(async (script) => {
      if (script.includes('INCR')) throw new Error('redis down');
      return 0;
    });

    await expect(statusesOf(2)).resolves.toEqual([400, 400]);
  });

  it('QUOTA · une unité comptée dans Redis est rendue à Redis, sur sa clé', async () => {
    evalScript.mockImplementation(async (script) => (script.includes('INCR') ? [1, 60_000] : 0));

    await expect(statusesOf(1)).resolves.toEqual([400]);
    const refundKeys = evalScript.mock.calls
      .filter(([script]) => !script.includes('INCR'))
      .map(([, , key]) => key);
    expect(refundKeys).toEqual([expect.stringMatching(/^ratelimit:.+:visitor$/)]);
  });
});
