import {
  BullmqEnrichmentSchedulerAdapter,
  DEFAULT_STALE_ENRICHMENT_CRON,
  ENRICHMENT_SCHEDULER_QUEUE_NAME,
  STALE_ENRICHMENT_SCAN_SCHEDULER_ID,
} from '@modules/museum/adapters/secondary/enrichment/bullmq-enrichment-scheduler.adapter';
import {
  startRedisTestContainer,
  type StartedRedisTestContainer,
} from 'tests/helpers/e2e/redis-testcontainer';

import { Queue } from 'bullmq';
import Redis from 'ioredis';

import type { PurgeDeadEnrichmentsUseCase } from '@modules/museum/useCase/enrichment/purgeDeadEnrichments.useCase';
import type { RefreshStaleEnrichmentsUseCase } from '@modules/museum/useCase/enrichment/refreshStaleEnrichments.useCase';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration('BullmqEnrichmentSchedulerAdapter (real Redis) [integration]', () => {
  jest.setTimeout(60_000);

  let container: StartedRedisTestContainer;
  let redisProbe: Redis;

  beforeAll(async () => {
    container = await startRedisTestContainer();
    redisProbe = new Redis(container.connection);
  });

  afterAll(async () => {
    await redisProbe.quit();
    await container.stop();
  });

  const makeRefreshUseCase = () =>
    ({
      execute: jest.fn(async () => ({ scanned: 3, refreshed: 2 })),
    }) as unknown as RefreshStaleEnrichmentsUseCase;

  const makePurgeUseCase = () =>
    ({
      execute: jest.fn(async () => ({ deleted: 1 })),
    }) as unknown as PurgeDeadEnrichmentsUseCase;

  describe('exported constants', () => {
    it('queue name + scheduler id + default cron stay stable for downstream observability', () => {
      expect(ENRICHMENT_SCHEDULER_QUEUE_NAME).toBe('museum-enrichment-scheduler');
      expect(STALE_ENRICHMENT_SCAN_SCHEDULER_ID).toBe('stale-enrichment-scan');
      expect(DEFAULT_STALE_ENRICHMENT_CRON).toBe('0 3 * * *');
    });
  });

  describe('start() / stop() lifecycle', () => {
    it('start() upserts a scheduler under STALE_ENRICHMENT_SCAN_SCHEDULER_ID', async () => {
      const adapter = new BullmqEnrichmentSchedulerAdapter(makeRefreshUseCase(), {
        connection: container.connection,
      });

      await adapter.start();

      const probe = new Queue(ENRICHMENT_SCHEDULER_QUEUE_NAME, {
        connection: container.connection,
      });
      try {
        const schedulers = await probe.getJobSchedulers();
        expect(schedulers.some((s) => s.key === STALE_ENRICHMENT_SCAN_SCHEDULER_ID)).toBe(true);
      } finally {
        await probe.close();
        await adapter.stop();
      }
    });

    it('start() honours a cron override via config', async () => {
      const adapter = new BullmqEnrichmentSchedulerAdapter(makeRefreshUseCase(), {
        connection: container.connection,
        cron: '*/15 * * * *',
      });

      await adapter.start();
      const probe = new Queue(ENRICHMENT_SCHEDULER_QUEUE_NAME, {
        connection: container.connection,
      });
      try {
        const schedulers = await probe.getJobSchedulers();
        const ours = schedulers.find((s) => s.key === STALE_ENRICHMENT_SCAN_SCHEDULER_ID);
        expect(ours?.pattern).toBe('*/15 * * * *');
      } finally {
        await probe.close();
        await adapter.stop();
      }
    });

    it('start() is idempotent — second call does not re-register or throw', async () => {
      const useCase = makeRefreshUseCase();
      const adapter = new BullmqEnrichmentSchedulerAdapter(useCase, {
        connection: container.connection,
      });

      await adapter.start();
      await expect(adapter.start()).resolves.toBeUndefined();

      await adapter.stop();
    });

    it('stop() before start() is a safe no-op', async () => {
      const adapter = new BullmqEnrichmentSchedulerAdapter(makeRefreshUseCase(), {
        connection: container.connection,
      });

      await expect(adapter.stop()).resolves.toBeUndefined();
    });

    it('stop() without a successful start() still releases the queue connection', async () => {
      const baseline = await connectedClients(redisProbe);
      const adapter = new BullmqEnrichmentSchedulerAdapter(makeRefreshUseCase(), {
        connection: container.connection,
      });
      await waitFor(async () => {
        expect(await connectedClients(redisProbe)).toBeGreaterThan(baseline);
      });

      await adapter.stop();

      await waitFor(async () => {
        expect(await connectedClients(redisProbe)).toBe(baseline);
      });
    });

    it('start() resolves once the worker is connected', async () => {
      const baseline = await connectedClients(redisProbe);
      const adapter = new BullmqEnrichmentSchedulerAdapter(makeRefreshUseCase(), {
        connection: container.connection,
      });
      await waitFor(async () => {
        expect(await connectedClients(redisProbe)).toBeGreaterThan(baseline);
      });
      const withQueueOnly = await connectedClients(redisProbe);

      await adapter.start();

      try {
        expect(await connectedClients(redisProbe)).toBeGreaterThan(withQueueOnly);
      } finally {
        await adapter.stop();
      }
    });

    it('stop() removes the scheduler + closes worker + queue without throwing', async () => {
      const adapter = new BullmqEnrichmentSchedulerAdapter(makeRefreshUseCase(), {
        connection: container.connection,
      });

      await adapter.start();
      await expect(adapter.stop()).resolves.toBeUndefined();

      const probe = new Queue(ENRICHMENT_SCHEDULER_QUEUE_NAME, {
        connection: container.connection,
      });
      try {
        const schedulers = await probe.getJobSchedulers();
        expect(
          schedulers.find((s) => s.key === STALE_ENRICHMENT_SCAN_SCHEDULER_ID),
        ).toBeUndefined();
      } finally {
        await probe.close();
      }
    });
  });

  describe('worker tick behaviour', () => {
    it('tick invokes RefreshStaleEnrichmentsUseCase.execute', async () => {
      const refreshUseCase = makeRefreshUseCase();
      const adapter = new BullmqEnrichmentSchedulerAdapter(refreshUseCase, {
        connection: container.connection,
      });

      await adapter.start();

      const probe = new Queue(ENRICHMENT_SCHEDULER_QUEUE_NAME, {
        connection: container.connection,
      });
      try {
        await probe.add('scan', {});
        await waitFor(() => {
          expect((refreshUseCase.execute as jest.Mock).mock.calls.length).toBeGreaterThan(0);
        });
      } finally {
        await probe.close();
        await adapter.stop();
      }
    });

    it('tick invokes PurgeDeadEnrichmentsUseCase.execute when wired with a threshold', async () => {
      const refreshUseCase = makeRefreshUseCase();
      const purgeUseCase = makePurgeUseCase();
      const adapter = new BullmqEnrichmentSchedulerAdapter(
        refreshUseCase,
        { connection: container.connection },
        purgeUseCase,
        30,
      );

      await adapter.start();
      const probe = new Queue(ENRICHMENT_SCHEDULER_QUEUE_NAME, {
        connection: container.connection,
      });
      try {
        await probe.add('scan', {});
        await waitFor(() => {
          expect((purgeUseCase.execute as jest.Mock).mock.calls.length).toBeGreaterThan(0);
        });
        const [whenArg, thresholdArg] = (purgeUseCase.execute as jest.Mock).mock.calls[0];
        expect(whenArg).toBeInstanceOf(Date);
        expect(thresholdArg).toBe(30);
      } finally {
        await probe.close();
        await adapter.stop();
      }
    });

    it('tick skips PurgeUseCase when no threshold is wired (backward compat)', async () => {
      const refreshUseCase = makeRefreshUseCase();
      const purgeUseCase = makePurgeUseCase();
      const adapter = new BullmqEnrichmentSchedulerAdapter(
        refreshUseCase,
        { connection: container.connection },
        purgeUseCase,
      );

      await adapter.start();
      const probe = new Queue(ENRICHMENT_SCHEDULER_QUEUE_NAME, {
        connection: container.connection,
      });
      try {
        await probe.add('scan', {});
        await waitFor(() => {
          expect((refreshUseCase.execute as jest.Mock).mock.calls.length).toBeGreaterThan(0);
        });
        expect((purgeUseCase.execute as jest.Mock).mock.calls).toHaveLength(0);
      } finally {
        await probe.close();
        await adapter.stop();
      }
    });
  });
});

async function connectedClients(probe: Redis): Promise<number> {
  const list = (await probe.client('LIST')) as string;
  return list.trim().split('\n').length;
}

async function waitFor(assertion: () => void | Promise<void>, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await assertion();
      return;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw lastError as Error;
}
