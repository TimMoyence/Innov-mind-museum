/**
 * Phase 10 Sprint 10.3 — `BullmqEnrichmentSchedulerAdapter` integration test.
 *
 * Pins the contract of the BullMQ-backed scheduler against a real Redis 7
 * testcontainer (mirrors the Phase 1 Postgres pattern):
 *   - `start()` is idempotent (second call is a no-op).
 *   - `start()` upserts a job scheduler under STALE_ENRICHMENT_SCAN_SCHEDULER_ID.
 *   - The recurring scheduler ticks invoke `RefreshStaleEnrichmentsUseCase.execute`
 *     and (when wired) `PurgeDeadEnrichmentsUseCase.execute(now, thresholdDays)`.
 *   - `stop()` removes the scheduler + closes the worker + queue without throwing.
 *   - `stop()` before `start()` is a no-op.
 *   - Exported constants stay stable (any downstream observability/runbook
 *     reference would break otherwise).
 *
 * Run with:
 *   RUN_INTEGRATION=true pnpm test:integration -- \
 *     --testPathPattern=bullmq-enrichment-scheduler.integration
 */
import {
  BullmqEnrichmentSchedulerAdapter,
  DEFAULT_STALE_ENRICHMENT_CRON,
  ENRICHMENT_SCHEDULER_QUEUE_NAME,
  STALE_ENRICHMENT_SCAN_SCHEDULER_ID,
} from '@modules/museum/adapters/secondary/bullmq-enrichment-scheduler.adapter';
import {
  startRedisTestContainer,
  type StartedRedisTestContainer,
} from 'tests/helpers/e2e/redis-testcontainer';

import { Queue } from 'bullmq';

import type { PurgeDeadEnrichmentsUseCase } from '@modules/museum/useCase/purgeDeadEnrichments.useCase';
import type { RefreshStaleEnrichmentsUseCase } from '@modules/museum/useCase/refreshStaleEnrichments.useCase';

const shouldRunIntegration = process.env.RUN_INTEGRATION === 'true';
const describeIntegration = shouldRunIntegration ? describe : describe.skip;

describeIntegration('BullmqEnrichmentSchedulerAdapter (real Redis) [integration]', () => {
  jest.setTimeout(60_000);

  let container: StartedRedisTestContainer;

  beforeAll(async () => {
    container = await startRedisTestContainer();
  });

  afterAll(async () => {
    await container.stop();
  });

  // ── Stub use cases ─────────────────────────────────────────────────────────
  // The adapter's only collaborators are the two use cases. We stub them with
  // jest.fn so each tick's effects are observable without spinning up the real
  // Wikidata + DB pipeline.

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
      // These three constants land in dashboards, runbooks, and the
      // BullMQ Bull-Board admin. Renaming them is a breaking change.
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

      // Inspect the scheduler list with a side-channel BullMQ Queue handle.
      // BullMQ persists schedulers as `repeat:<id>` keys in Redis; the high-
      // level `getJobSchedulers()` API confirms registration.
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
      // Second call must observe the `started` guard and return without
      // touching the queue.
      await expect(adapter.start()).resolves.toBeUndefined();

      await adapter.stop();
    });

    it('stop() before start() is a safe no-op', async () => {
      const adapter = new BullmqEnrichmentSchedulerAdapter(makeRefreshUseCase(), {
        connection: container.connection,
      });

      await expect(adapter.stop()).resolves.toBeUndefined();
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

      // Inject a manual tick by adding a job under the scheduler's name. The
      // scheduler upserts under `STALE_ENRICHMENT_SCAN_SCHEDULER_ID` w/ name
      // 'scan', so a one-off `add('scan', {})` exercises the same worker
      // handler without waiting for the cron tick.
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
        // Intentionally no purgeThresholdDays — the scheduler must NOT call
        // purge in that case (legacy single-arg constructor compat).
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
        // Refresh fired; purge should NOT have been touched.
        expect((purgeUseCase.execute as jest.Mock).mock.calls).toHaveLength(0);
      } finally {
        await probe.close();
        await adapter.stop();
      }
    });
  });
});

/**
 * Polls the assertion until it passes (or 8s elapses). Mirrors testing-library's waitFor.
 * @param assertion - Callback whose thrown error retries until it returns cleanly.
 * @param timeoutMs - Hard deadline; rethrows the last assertion error after expiry.
 */
async function waitFor(assertion: () => void, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  // Probe every 100ms with an explicit deadline; retains deterministic exit.
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw lastError as Error;
}
