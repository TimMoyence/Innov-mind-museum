import Redis from 'ioredis';

import { RedisRateLimitStore } from '@shared/middleware/redis-rate-limit-store';

import {
  startRedisTestContainer,
  type StartedRedisTestContainer,
} from '../../helpers/e2e/redis-testcontainer';

const describeIntegration = process.env.RUN_INTEGRATION === 'true' ? describe : describe.skip;

const SHORT_WINDOW_MS = 300;
const LONG_WINDOW_MS = 60_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

describeIntegration('RedisRateLimitStore — remboursement lié à sa fenêtre (vrai Redis)', () => {
  jest.setTimeout(60_000);

  let container: StartedRedisTestContainer;
  let redis: Redis;
  let store: RedisRateLimitStore;

  beforeAll(async () => {
    container = await startRedisTestContainer();
    redis = new Redis(container.connection);
    store = new RedisRateLimitStore(redis);
  });

  afterAll(async () => {
    store.stopSweep();
    await redis.quit();
    await container.stop();
  });

  it('QUOTA · une unité comptée dans une fenêtre expirée ne rembourse pas la fenêtre suivante', async () => {
    const slowRejected = await store.increment('refund:window', SHORT_WINDOW_MS);
    await sleep(SHORT_WINDOW_MS + 200);
    await store.increment('refund:window', LONG_WINDOW_MS);

    await slowRejected.release();

    await expect(store.increment('refund:window', LONG_WINDOW_MS)).resolves.toMatchObject({
      count: 2,
    });
  });

  it('QUOTA · un remboursement ne fait jamais passer le compteur sous zéro', async () => {
    const counted = await store.increment('refund:floor', LONG_WINDOW_MS);

    await counted.release();
    await counted.release();

    await expect(store.increment('refund:floor', LONG_WINDOW_MS)).resolves.toMatchObject({
      count: 1,
    });
  });
});
