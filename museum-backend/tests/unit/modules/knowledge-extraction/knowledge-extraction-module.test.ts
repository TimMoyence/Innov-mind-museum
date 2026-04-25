/**
 * Verifies the `EXTRACTION_WORKER_ENABLED=false` short-circuit in
 * `KnowledgeExtractionModule.build()`. This branch must:
 *  - return the db-lookup-only fallback shape (no `extractionQueue`)
 *  - log `knowledge_extraction_disabled`
 *  - NEVER instantiate the BullMQ-backed `ExtractionWorker` (which would
 *    open ioredis sockets in test environments without Redis).
 *
 * Covered for parity with the e2e harness which pins the flag to false.
 */

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@src/config/env', () => ({
  env: {
    extractionWorkerEnabled: false,
    llm: { openAiApiKey: undefined },
    extraction: {
      queueConcurrency: 2,
      queueRateLimit: 60,
      scrapeTimeoutMs: 5000,
      contentMaxBytes: 51200,
      refetchAfterDays: 7,
      llmModel: 'gpt-4o-mini',
      confidenceThreshold: 0.7,
      reviewThreshold: 0.4,
    },
    redis: { host: 'localhost', port: 6379, password: undefined },
  },
}));

const extractionWorkerCtor = jest.fn();
jest.mock('@modules/knowledge-extraction/adapters/primary/extraction.worker', () => ({
  ExtractionWorker: jest.fn().mockImplementation((...args: unknown[]) => {
    extractionWorkerCtor(...args);
    return { start: jest.fn(), close: jest.fn().mockResolvedValue(undefined) };
  }),
}));

import { logger } from '@shared/logger/logger';
import { KnowledgeExtractionModule } from '@modules/knowledge-extraction';
import { ExtractionWorker } from '@modules/knowledge-extraction/adapters/primary/extraction.worker';

import { makeMockDataSource } from '../../../helpers/data-source/mock-data-source';

describe('KnowledgeExtractionModule.build — EXTRACTION_WORKER_ENABLED=false', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the db-lookup-only fallback shape and skips BullMQ wiring', () => {
    const { dataSource } = makeMockDataSource();

    const built = new KnowledgeExtractionModule().build(dataSource);

    expect(built.dbLookup).toBeDefined();
    expect(built.artworkKnowledgeRepo).toBeDefined();
    expect(built.extractionQueue).toBeUndefined();
    expect(typeof built.close).toBe('function');
  });

  it('does not instantiate the ExtractionWorker (no BullMQ / ioredis)', () => {
    const { dataSource } = makeMockDataSource();

    new KnowledgeExtractionModule().build(dataSource);

    expect(ExtractionWorker).not.toHaveBeenCalled();
    expect(extractionWorkerCtor).not.toHaveBeenCalled();
  });

  it('logs `knowledge_extraction_disabled` with the flag-off reason', () => {
    const { dataSource } = makeMockDataSource();

    new KnowledgeExtractionModule().build(dataSource);

    expect(logger.info).toHaveBeenCalledWith('knowledge_extraction_disabled', {
      reason: 'extraction_worker_flag_off',
    });
  });

  it('returns a no-op close() that resolves without error', async () => {
    const { dataSource } = makeMockDataSource();

    const built = new KnowledgeExtractionModule().build(dataSource);

    await expect(built.close()).resolves.toBeUndefined();
  });
});
