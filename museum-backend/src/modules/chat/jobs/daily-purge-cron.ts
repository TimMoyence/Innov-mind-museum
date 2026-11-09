import { registerScheduledJob } from '@shared/queue/scheduled-jobs';

import type { ConnectionOptions } from 'bullmq';

export interface DailyPurgeCronConfig {
  queueName: string;
  schedulerId: string;
  cron: string;
  connection: ConnectionOptions;
  createTick: () => () => Promise<unknown>;
}

export interface DailyPurgeCronHandle {
  stop: () => Promise<void>;
}

export async function registerDailyPurgeCron(
  cfg: DailyPurgeCronConfig,
): Promise<DailyPurgeCronHandle> {
  let tick: (() => Promise<unknown>) | undefined;
  const job = registerScheduledJob({
    name: cfg.queueName,
    schedulerId: cfg.schedulerId,
    cronPattern: cfg.cron,
    connection: cfg.connection,
    handler: async () => {
      tick ??= cfg.createTick();
      await tick();
    },
  });
  if (await job.start()) tick ??= cfg.createTick();
  return { stop: () => job.close() };
}
