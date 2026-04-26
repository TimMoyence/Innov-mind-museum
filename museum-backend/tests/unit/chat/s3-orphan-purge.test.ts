import { ChatMessage } from '@modules/chat/domain/chatMessage.entity';
import { runS3OrphanPurge } from '@modules/chat/jobs/s3-orphan-purge.job';

import { makeMockQb } from 'tests/helpers/shared/mock-query-builder';

import type { S3ImageStorageConfig } from '@modules/chat/adapters/secondary/s3-operations';
import type { DataSource } from 'typeorm';

const FAKE_S3_CONFIG: S3ImageStorageConfig = {
  endpoint: 'https://s3.example.com',
  region: 'us-east-1',
  bucket: 'musaium-test',
  accessKeyId: 'AKIA-TEST',
  secretAccessKey: 'SECRET-TEST',
  signedUrlTtlSeconds: 900,
};

interface OrphanMockOpts {
  /** Pages keyed by prefix the lister will yield, in order. */
  pagesByPrefix: Record<
    string,
    { objects: { key: string; lastModifiedMs: number }[]; nextToken?: string }[]
  >;
  /** s3:// refs the DB query should claim are still referenced. */
  referencedRefs?: string[];
  /** Force the deleter to throw for a specific key (per-batch isolation). */
  deleterFailKeys?: string[];
}

function buildOrphanMocks(opts: OrphanMockOpts) {
  const pagesByPrefix: Record<string, OrphanMockOpts['pagesByPrefix'][string]> = {
    ...opts.pagesByPrefix,
  };
  const callIndex: Record<string, number> = {};

  const pageLister = jest.fn(async (_config, prefix: string) => {
    callIndex[prefix] ??= 0;
    const pages = pagesByPrefix[prefix] ?? [];
    const page = pages[callIndex[prefix]] ?? { objects: [] };
    callIndex[prefix] += 1;
    return Promise.resolve({ objects: page.objects, nextToken: page.nextToken });
  });

  const batchDeleter = jest.fn(async (_config, keys: string[]) => {
    if (opts.deleterFailKeys && keys.some((k) => opts.deleterFailKeys?.includes(k))) {
      throw new Error('S3 503');
    }
    return Promise.resolve();
  });

  // DB mock: getRawMany returns rows whose imageRef/audioUrl is in the
  // referencedRefs allowlist.
  const queryQb = makeMockQb();
  queryQb.getRawMany.mockImplementation(() => {
    const rows = (opts.referencedRefs ?? []).map((ref) => ({
      imageRef: ref,
      audioUrl: null,
    }));
    return Promise.resolve(rows);
  });
  const messageRepo = { createQueryBuilder: jest.fn(() => queryQb) };
  const dataSource = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === ChatMessage) return messageRepo;
      throw new Error('Unexpected entity');
    }),
  } as unknown as DataSource;

  return { dataSource, pageLister, batchDeleter };
}

describe('runS3OrphanPurge', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes objects with no DB reference under each prefix', async () => {
    const { dataSource, pageLister, batchDeleter } = buildOrphanMocks({
      pagesByPrefix: {
        'chat-images/': [
          {
            objects: [
              { key: 'chat-images/orphan-1.jpg', lastModifiedMs: 0 },
              { key: 'chat-images/orphan-2.jpg', lastModifiedMs: 0 },
            ],
          },
        ],
        'chat-audios/': [{ objects: [{ key: 'chat-audios/orphan-3.mp3', lastModifiedMs: 0 }] }],
      },
      referencedRefs: [],
    });

    const result = await runS3OrphanPurge(dataSource, {
      s3Config: FAKE_S3_CONFIG,
      retentionDays: 180,
      pageLister,
      batchDeleter,
    });

    expect(batchDeleter).toHaveBeenCalledWith(FAKE_S3_CONFIG, [
      'chat-images/orphan-1.jpg',
      'chat-images/orphan-2.jpg',
    ]);
    expect(batchDeleter).toHaveBeenCalledWith(FAKE_S3_CONFIG, ['chat-audios/orphan-3.mp3']);
    expect(result.scanned).toBe(3);
    expect(result.deleted).toBe(3);
    expect(result.referenced).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('preserves objects still referenced by chat_messages', async () => {
    const { dataSource, pageLister, batchDeleter } = buildOrphanMocks({
      pagesByPrefix: {
        'chat-images/': [
          {
            objects: [
              { key: 'chat-images/live.jpg', lastModifiedMs: 0 },
              { key: 'chat-images/dead.jpg', lastModifiedMs: 0 },
            ],
          },
        ],
        'chat-audios/': [{ objects: [] }],
      },
      referencedRefs: ['s3://chat-images/live.jpg'],
    });

    const result = await runS3OrphanPurge(dataSource, {
      s3Config: FAKE_S3_CONFIG,
      retentionDays: 180,
      pageLister,
      batchDeleter,
    });

    expect(batchDeleter).toHaveBeenCalledTimes(1);
    expect(batchDeleter).toHaveBeenCalledWith(FAKE_S3_CONFIG, ['chat-images/dead.jpg']);
    expect(result.deleted).toBe(1);
    expect(result.referenced).toBe(1);
  });

  it('skips fresh objects under the retention threshold', async () => {
    const recent = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days old
    const old = Date.now() - 200 * 24 * 60 * 60 * 1000; // 200 days old

    const { dataSource, pageLister, batchDeleter } = buildOrphanMocks({
      pagesByPrefix: {
        'chat-images/': [
          {
            objects: [
              { key: 'chat-images/fresh.jpg', lastModifiedMs: recent },
              { key: 'chat-images/old.jpg', lastModifiedMs: old },
            ],
          },
        ],
        'chat-audios/': [{ objects: [] }],
      },
      referencedRefs: [],
    });

    const result = await runS3OrphanPurge(dataSource, {
      s3Config: FAKE_S3_CONFIG,
      retentionDays: 180,
      pageLister,
      batchDeleter,
    });

    expect(batchDeleter).toHaveBeenCalledWith(FAKE_S3_CONFIG, ['chat-images/old.jpg']);
    expect(result.tooFresh).toBe(1);
    expect(result.deleted).toBe(1);
  });

  it('paginates via continuation tokens', async () => {
    const { dataSource, pageLister, batchDeleter } = buildOrphanMocks({
      pagesByPrefix: {
        'chat-images/': [
          {
            objects: [{ key: 'chat-images/p1.jpg', lastModifiedMs: 0 }],
            nextToken: 'token-2',
          },
          {
            objects: [{ key: 'chat-images/p2.jpg', lastModifiedMs: 0 }],
          },
        ],
        'chat-audios/': [{ objects: [] }],
      },
      referencedRefs: [],
    });

    const result = await runS3OrphanPurge(dataSource, {
      s3Config: FAKE_S3_CONFIG,
      retentionDays: 180,
      pageLister,
      batchDeleter,
    });

    expect(pageLister).toHaveBeenCalledWith(FAKE_S3_CONFIG, 'chat-images/', undefined);
    expect(pageLister).toHaveBeenCalledWith(FAKE_S3_CONFIG, 'chat-images/', 'token-2');
    expect(result.scanned).toBe(2);
    expect(result.deleted).toBe(2);
  });

  it('counts batch failures without aborting subsequent prefixes', async () => {
    const { dataSource, pageLister, batchDeleter } = buildOrphanMocks({
      pagesByPrefix: {
        'chat-images/': [{ objects: [{ key: 'chat-images/boom.jpg', lastModifiedMs: 0 }] }],
        'chat-audios/': [{ objects: [{ key: 'chat-audios/ok.mp3', lastModifiedMs: 0 }] }],
      },
      referencedRefs: [],
      deleterFailKeys: ['chat-images/boom.jpg'],
    });

    const result = await runS3OrphanPurge(dataSource, {
      s3Config: FAKE_S3_CONFIG,
      retentionDays: 180,
      pageLister,
      batchDeleter,
    });

    expect(result.failed).toBe(1);
    expect(result.deleted).toBe(1);
    expect(batchDeleter).toHaveBeenCalledTimes(2);
  });

  it('runs cleanly with no objects at all', async () => {
    const { dataSource, pageLister, batchDeleter } = buildOrphanMocks({
      pagesByPrefix: {
        'chat-images/': [{ objects: [] }],
        'chat-audios/': [{ objects: [] }],
      },
      referencedRefs: [],
    });

    const result = await runS3OrphanPurge(dataSource, {
      s3Config: FAKE_S3_CONFIG,
      retentionDays: 180,
      pageLister,
      batchDeleter,
    });

    expect(batchDeleter).not.toHaveBeenCalled();
    expect(result).toEqual({
      scanned: 0,
      deleted: 0,
      referenced: 0,
      tooFresh: 0,
      failed: 0,
    });
  });
});
