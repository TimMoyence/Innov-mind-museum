import { buildChatMediaPurgerFromEnv } from './chat-media-purger';
import { runChatPurge } from './chat-purge.job';
import { registerDailyPurgeCron, type DailyPurgeCronHandle } from './daily-purge-cron';

import type { ChatMediaPurger } from './chat-media-purger';
import type { ConnectionOptions } from 'bullmq';
import type { DataSource } from 'typeorm';

export const CHAT_PURGE_QUEUE_NAME = 'chat-purge-scheduler';

export const CHAT_PURGE_SCHEDULER_ID = 'chat-purge-daily';

export const DEFAULT_CHAT_PURGE_CRON = '0 4 * * *';

export interface ChatPurgeCronConfig {
  connection: ConnectionOptions;
  retentionDays?: number;
  cron?: string;
  mediaPurger?: ChatMediaPurger;
}

export type ChatPurgeCronHandle = DailyPurgeCronHandle;

export function registerChatPurgeCron(
  dataSource: DataSource,
  config: ChatPurgeCronConfig,
): Promise<ChatPurgeCronHandle> {
  return registerDailyPurgeCron({
    queueName: CHAT_PURGE_QUEUE_NAME,
    schedulerId: CHAT_PURGE_SCHEDULER_ID,
    cron: config.cron ?? DEFAULT_CHAT_PURGE_CRON,
    connection: config.connection,
    createTick: () => {
      const mediaPurger = config.mediaPurger ?? buildChatMediaPurgerFromEnv();
      return async () => {
        await runChatPurge(dataSource, { retentionDays: config.retentionDays, mediaPurger });
      };
    },
  });
}
