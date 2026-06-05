/**
 * RED (T4.1 — Cycle D, R7) — `listObjectsByPrefix` must surface per-object
 * `LastModified`, correlated to each `Key`.
 *
 * The S3 orphan-purge job's age filter needs the real `LastModified` of every
 * object so a freshly-uploaded image not yet committed to the DB is protected by
 * the retention grace-period (spec §1.2, design §1 D2). Today
 * `listObjectsByPrefix` returns `{ keys, nextToken }` only — the flat
 * `extractXmlValues(body, 'Key')` cannot correlate a key with its timestamp — so
 * the `defaultPageLister` maps every key to `lastModifiedMs: 0` and the age
 * filter is inoperative.
 *
 * GREEN contract: `listObjectsByPrefix` returns
 *   `{ objects: { key: string; lastModifiedMs: number }[]; nextToken }`
 * parsing each `<Contents>` block to pair `Key` ↔ `LastModified` (ISO → epoch
 * ms via `Date.parse`).
 *
 * RED at baseline: `result.objects` is `undefined` → the per-object assertions
 * fail.
 *
 * Drives a real local `http` server (mirror `image-storage.s3.test.ts`) so the
 * signed-request + XML-parse path is exercised end-to-end, not mocked away.
 */
import http from 'node:http';

import { listObjectsByPrefix } from '@modules/chat/adapters/secondary/storage/s3-operations';

import type { S3ImageStorageConfig } from '@modules/chat/adapters/secondary/storage/s3-operations';

const BASE_CONFIG: Omit<S3ImageStorageConfig, 'endpoint'> = {
  region: 'auto',
  bucket: 'museum-private',
  accessKeyId: 'test-access-key',
  secretAccessKey: 'test-secret-key',
  signedUrlTtlSeconds: 900,
};

/**
 * Serves a single XML body on the next request, then resolves the callback.
 * @param xmlBody
 * @param run
 */
async function withTestServer<T>(xmlBody: string, run: (port: number) => Promise<T>): Promise<T> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/xml' });
    res.end(xmlBody);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no server address');
  try {
    return await run(address.port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => { resolve(); }));
  }
}

// Shape the green phase must return — `objects` paired key↔timestamp.
interface ListResultWithObjects {
  objects?: { key: string; lastModifiedMs: number }[];
  nextToken?: string;
}

describe('listObjectsByPrefix — per-object LastModified (R7)', () => {
  it('returns objects paired { key, lastModifiedMs } parsed from <Contents>', async () => {
    const isoA = '2026-05-01T12:00:00.000Z';
    const isoB = '2026-04-15T08:30:00.000Z';
    const listXml = `<?xml version="1.0" encoding="UTF-8"?>
      <ListBucketResult>
        <IsTruncated>false</IsTruncated>
        <Contents><Key>chat-images/a.png</Key><LastModified>${isoA}</LastModified><Size>10</Size></Contents>
        <Contents><Key>chat-images/b.jpg</Key><LastModified>${isoB}</LastModified><Size>20</Size></Contents>
      </ListBucketResult>`;

    const result = (await withTestServer(listXml, async (port) =>
      listObjectsByPrefix(
        { ...BASE_CONFIG, endpoint: `http://127.0.0.1:${port}`, requestTimeoutMs: 5000 },
        'chat-images/',
      ),
    )) as unknown as ListResultWithObjects;

    expect(Array.isArray(result.objects)).toBe(true);
    expect(result.objects).toEqual([
      { key: 'chat-images/a.png', lastModifiedMs: Date.parse(isoA) },
      { key: 'chat-images/b.jpg', lastModifiedMs: Date.parse(isoB) },
    ]);
  });

  it('still surfaces the continuation token on a truncated page', async () => {
    const iso = '2026-05-10T00:00:00.000Z';
    const listXml = `<?xml version="1.0" encoding="UTF-8"?>
      <ListBucketResult>
        <IsTruncated>true</IsTruncated>
        <NextContinuationToken>token-xyz</NextContinuationToken>
        <Contents><Key>chat-images/c.png</Key><LastModified>${iso}</LastModified></Contents>
      </ListBucketResult>`;

    const result = (await withTestServer(listXml, async (port) =>
      listObjectsByPrefix(
        { ...BASE_CONFIG, endpoint: `http://127.0.0.1:${port}`, requestTimeoutMs: 5000 },
        'chat-images/',
      ),
    )) as unknown as ListResultWithObjects;

    expect(result.objects).toEqual([{ key: 'chat-images/c.png', lastModifiedMs: Date.parse(iso) }]);
    expect(result.nextToken).toBe('token-xyz');
  });
});
