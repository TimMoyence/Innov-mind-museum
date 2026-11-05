import { BullmqEnrichmentSchedulerAdapter } from '@modules/museum/adapters/secondary/enrichment/bullmq-enrichment-scheduler.adapter';

import type { RefreshStaleEnrichmentsPort } from '@modules/museum/domain/ports/enrichment-usecases.port';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@shared/observability/sentry', () => ({
  captureExceptionWithContext: jest.fn(),
}));

const mockQueueClose = jest.fn().mockResolvedValue(undefined);
const mockWorkerClose = jest.fn().mockResolvedValue(undefined);
const mockWaitUntilReady = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
    removeJobScheduler: jest.fn().mockResolvedValue(undefined),
    close: mockQueueClose,
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    waitUntilReady: mockWaitUntilReady,
    close: mockWorkerClose,
  })),
}));

const refreshUseCase: RefreshStaleEnrichmentsPort = {
  execute: jest.fn().mockResolvedValue({ scanned: 0, refreshed: 0 }),
};

describe('BullmqEnrichmentSchedulerAdapter.start()', () => {
  it('releases the queue and the worker when the worker never becomes ready', async () => {
    const adapter = new BullmqEnrichmentSchedulerAdapter(refreshUseCase, {
      connection: { host: '127.0.0.1', port: 6379 },
    });
    mockWaitUntilReady.mockRejectedValueOnce(new Error('Connection is closed.'));

    await expect(adapter.start()).rejects.toThrow('Connection is closed.');

    expect(mockWorkerClose).toHaveBeenCalledTimes(1);
    expect(mockQueueClose).toHaveBeenCalledTimes(1);
  });
});
