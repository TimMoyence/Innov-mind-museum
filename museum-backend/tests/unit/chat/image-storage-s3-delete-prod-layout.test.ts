import http from 'http';

import { S3CompatibleImageStorage } from '@modules/chat/adapters/secondary/storage/image-storage.s3';

const config = {
  endpoint: 'https://storage.example.com',
  region: 'auto',
  bucket: 'museum-private',
  accessKeyId: 'test-access-key',
  secretAccessKey: 'test-secret-key',
  signedUrlTtlSeconds: 900,
};

interface CapturedRequest {
  method: string;
  path: string;
  body: string;
}

const PROD_LIST_XML = `<?xml version="1.0" encoding="UTF-8"?>
  <ListBucketResult>
    <IsTruncated>false</IsTruncated>
    <Contents><Key>chat-images/2026/05/user-42/session-1/aaa.png</Key></Contents>
    <Contents><Key>chat-images/2026/05/user-42/session-2/bbb.jpg</Key></Contents>
    <Contents><Key>chat-images/2026/05/user-420/session-9/ccc.png</Key></Contents>
  </ListBucketResult>`;

async function runDeleteByPrefix(userId: number): Promise<CapturedRequest[]> {
  const requests: CapturedRequest[] = [];
  await new Promise<void>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      req.on('end', () => {
        requests.push({
          method: req.method ?? '',
          path: req.url ?? '',
          body: Buffer.concat(chunks).toString('utf8'),
        });
        res.statusCode = 200;
        res.end(req.method === 'GET' ? PROD_LIST_XML : '');
      });
    });

    server.listen(0, async () => {
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('bind failed');
        const storage = new S3CompatibleImageStorage({
          ...config,
          endpoint: `http://127.0.0.1:${address.port}`,
          requestTimeoutMs: 5000,
        });
        await storage.deleteByPrefix(userId);
        server.close();
        resolve();
      } catch (err) {
        server.close();
        reject(err);
      }
    });
  });
  return requests;
}

describe('S3CompatibleImageStorage.deleteByPrefix — production layout (B4 / R7)', () => {
  it('deletes only /user-42/ keys and leaves the user-420 decoy untouched', async () => {
    const requests = await runDeleteByPrefix(42);

    const deleteBodies = requests
      .filter((r) => r.method === 'POST' && r.path.includes('?delete='))
      .map((r) => r.body)
      .join('\n');

    expect(deleteBodies).toContain('chat-images/2026/05/user-42/session-1/aaa.png');
    expect(deleteBodies).toContain('chat-images/2026/05/user-42/session-2/bbb.jpg');

    expect(deleteBodies).not.toContain('chat-images/2026/05/user-420/session-9/ccc.png');
  });
});
