/**
 * RED (T4.2 — Cycle D, R7) — the orphan-purge job's age filter must be
 * AUTHORITATIVE through the PRODUCTION (default) page lister.
 *
 * Today the production path is inoperative as a grace-period:
 *  - `defaultPageLister` (`s3-orphan-purge.job.ts:61-75`) drops the real
 *    `LastModified` and maps EVERY key to `lastModifiedMs: 0`, and
 *  - `processOrphanPage:170` treats `lastModifiedMs === 0` as ALWAYS eligible.
 * So a freshly-uploaded, not-yet-DB-referenced object (e.g. an image uploaded
 * seconds before the sweep, before its `chat_messages` row commits) is deleted
 * immediately — the `retentionDays` grace-period never protects it (spec §1.2,
 * design §1 D2).
 *
 * GREEN contract:
 *  - `defaultPageLister` passes through the real `lastModifiedMs` from
 *    `listObjectsByPrefix` (which now returns `{ objects: {key, lastModifiedMs} }`).
 *  - the `o.lastModifiedMs === 0 ||` short-circuit is removed so the age filter
 *    is authoritative.
 *
 * This test drives `runS3OrphanPurge` WITHOUT a `pageLister` override (exercising
 * the production default lister) and only mocks the network seams
 * (`listObjectsByPrefix` / `deleteObjectsBatch`) + the DB-reference query.
 *
 * RED at baseline: the default lister maps the recent object to `0`, the `=== 0`
 * short-circuit makes it eligible, and with no DB reference it is DELETED → the
 * "recent object is tooFresh, not deleted" assertion fails.
 */
import { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';
import { runS3OrphanPurge } from '@modules/chat/jobs/s3-orphan-purge.job';
import { listObjectsByPrefix } from '@modules/chat/adapters/secondary/storage/s3-operations';

import { makeMockQb } from 'tests/helpers/shared/mock-query-builder';

import type { S3ImageStorageConfig } from '@modules/chat/adapters/secondary/storage/s3-operations';
import type { DataSource } from 'typeorm';

jest.mock('@shared/logger/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock ONLY the network seams of the S3 adapter; keep everything else real so
// the production `defaultPageLister` path (which imports `listObjectsByPrefix`
// from this module) is exercised — not bypassed.
jest.mock('@modules/chat/adapters/secondary/storage/s3-operations', () => {
  const actual = jest.requireActual(
    '@modules/chat/adapters/secondary/storage/s3-operations',
  );
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

/** Build a DataSource whose ChatMessage query reports zero referenced keys. */
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
    const recentIso = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(); // 1 day old
    const oldIso = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(); // 200 days old

    // Production `listObjectsByPrefix` must surface real per-object timestamps.
    // We return BOTH the legacy `keys` shape (what the pre-green lister reads,
    // mapping every key to lastModifiedMs:0 → no grace-period) AND the green
    // `objects` shape (paired key↔timestamp). Pre-green: the lister reads `keys`
    // → fresh.png is treated as epoch-0 → deleted → the tooFresh assertion FAILS
    // (red). Post-green: the lister reads `objects` → fresh.png is within the
    // grace window → tooFresh, not deleted (green).
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
      // NO pageLister override → exercises the production defaultPageLister.
      batchDeleter,
    });

    expect(mockedListObjects).toHaveBeenCalled();

    // The recent object is within the 180-day grace-period → tooFresh, NOT deleted.
    expect(result.tooFresh).toBe(1);
    expect(batchDeleter).not.toHaveBeenCalledWith(FAKE_S3_CONFIG, ['chat-images/fresh.png']);
    expect(batchDeleter).not.toHaveBeenCalledWith(
      FAKE_S3_CONFIG,
      expect.arrayContaining(['chat-images/fresh.png']),
    );

    // The old unreferenced object IS deleted.
    expect(batchDeleter).toHaveBeenCalledWith(
      FAKE_S3_CONFIG,
      expect.arrayContaining(['chat-images/stale.png']),
    );
    expect(result.deleted).toBe(1);
  });
});
