import { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import { runS3OrphanPurge } from '@modules/chat/jobs/s3-orphan-purge.job';
import { listObjectsByPrefix } from '@modules/chat/adapters/secondary/storage/s3-operations';

import { makeMockQb } from 'tests/helpers/shared/mock-query-builder';

import type { S3ImageStorageConfig } from '@modules/chat/adapters/secondary/storage/s3-operations';
import type { DataSource } from 'typeorm';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@modules/chat/adapters/secondary/storage/s3-operations', () => {
  const actual = jest.requireActual('@modules/chat/adapters/secondary/storage/s3-operations');
  return {
    ...actual,
    listObjectsByPrefix: jest.fn(),
    deleteObjectsBatch: jest.fn(),
  };
});

const mockedListObjects = listObjectsByPrefix as jest.MockedFunction<typeof listObjectsByPrefix>;

const FAKE_S3_CONFIG: S3ImageStorageConfig = {
  endpoint: 'https://s3.example.com',
  region: 'us-east-1',
  bucket: 'musaium-test',
  accessKeyId: 'AKIA-TEST',
  secretAccessKey: 'SECRET-TEST',
  signedUrlTtlSeconds: 900,
};

function buildEmptyRefDataSource(): DataSource {
  const queryQb = makeMockQb();
  queryQb.getRawMany.mockResolvedValue([]);
  const messageRepo = { createQueryBuilder: jest.fn(() => queryQb) };
  return {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === ChatMessage) return messageRepo;
      throw new Error('Unexpected entity');
    }),
  } as unknown as DataSource;
}

describe('runS3OrphanPurge — production default lister honours the age filter (R7)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('does NOT delete a recent unreferenced object (within retention) but DOES delete an old one', async () => {
    const recentIso = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const oldIso = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();

    const fresh = { key: 'chat-images/fresh.png', lastModifiedMs: Date.parse(recentIso) };
    const stale = { key: 'chat-images/stale.png', lastModifiedMs: Date.parse(oldIso) };
    mockedListObjects.mockImplementation((async (_config: unknown, prefix: string) => {
      if (prefix === 'chat-images/') {
        return {
          keys: [fresh.key, stale.key],
          objects: [fresh, stale],
          nextToken: undefined,
        };
      }
      return { keys: [], objects: [], nextToken: undefined };
    }) as unknown as typeof listObjectsByPrefix);

    const batchDeleter = jest.fn(async () => undefined);

    const result = await runS3OrphanPurge(buildEmptyRefDataSource(), {
      s3Config: FAKE_S3_CONFIG,
      retentionDays: 180,
      batchDeleter,
    });

    expect(mockedListObjects).toHaveBeenCalled();

    expect(result.tooFresh).toBe(1);
    expect(batchDeleter).not.toHaveBeenCalledWith(FAKE_S3_CONFIG, ['chat-images/fresh.png']);
    expect(batchDeleter).not.toHaveBeenCalledWith(
      FAKE_S3_CONFIG,
      expect.arrayContaining(['chat-images/fresh.png']),
    );

    expect(batchDeleter).toHaveBeenCalledWith(
      FAKE_S3_CONFIG,
      expect.arrayContaining(['chat-images/stale.png']),
    );
    expect(result.deleted).toBe(1);
  });
});
