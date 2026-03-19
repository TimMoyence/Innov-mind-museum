import http from 'http';

import {
  S3CompatibleImageStorage,
  buildS3ImageRef,
  buildS3PresignedReadUrl,
  buildS3SignedReadUrlFromRef,
  isS3ImageRef,
  parseS3ImageRef,
  listObjectsByPrefix,
  deleteObjectsBatch,
} from '@modules/chat/adapters/secondary/image-storage.s3';

const config = {
  endpoint: 'https://storage.example.com',
  region: 'auto',
  bucket: 'museum-private',
  accessKeyId: 'test-access-key',
  secretAccessKey: 'test-secret-key',
  signedUrlTtlSeconds: 900,
};

describe('image-storage.s3', () => {
  it('parses and detects s3 image refs', () => {
    const imageRef = buildS3ImageRef('chat-images/2026/02/test.png');

    expect(isS3ImageRef(imageRef)).toBe(true);
    expect(parseS3ImageRef(imageRef)).toEqual({
      key: 'chat-images/2026/02/test.png',
    });
    expect(isS3ImageRef('local://abc.png')).toBe(false);
    expect(parseS3ImageRef('local://abc.png')).toBeNull();
  });

  it('builds deterministic presigned read urls', () => {
    const now = new Date('2026-02-23T10:00:00.000Z');
    const result = buildS3PresignedReadUrl({
      key: 'chat-images/2026/02/test image.png',
      config,
      ttlSeconds: 300,
      now,
    });

    const url = new URL(result.url);
    expect(url.origin).toBe('https://storage.example.com');
    expect(url.pathname).toBe('/museum-private/chat-images/2026/02/test%20image.png');
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(result.expiresAt).toBe('2026-02-23T10:05:00.000Z');
  });

  it('builds presigned url from s3 image ref', () => {
    const now = new Date('2026-02-23T10:00:00.000Z');
    const result = buildS3SignedReadUrlFromRef({
      imageRef: 's3://chat-images/2026/02/test.webp',
      config,
      now,
    });

    expect(result).toEqual(
      expect.objectContaining({
        url: expect.stringContaining('/museum-private/chat-images/2026/02/test.webp?'),
        expiresAt: '2026-02-23T10:15:00.000Z',
      }),
    );
    expect(
      buildS3SignedReadUrlFromRef({
        imageRef: 'local://abc.jpg',
        config,
      }),
    ).toBeNull();
  });

  it('supports public read base urls and session tokens in presigned read urls', () => {
    const now = new Date('2026-02-23T10:00:00.000Z');
    const result = buildS3PresignedReadUrl({
      key: 'chat-images/2026/02/private.png',
      config: {
        ...config,
        publicBaseUrl: 'https://cdn.example.com/{bucket}',
        sessionToken: 'session-token-abc',
      },
      ttlSeconds: 120,
      now,
    });

    const url = new URL(result.url);
    expect(url.origin).toBe('https://cdn.example.com');
    expect(url.pathname).toBe('/museum-private/chat-images/2026/02/private.png');
    expect(url.searchParams.get('X-Amz-Security-Token')).toBe('session-token-abc');
  });

  it('uploads image bytes with a signed PUT request', async () => {
    const received = await new Promise<{
      path: string;
      method: string;
      headers: http.IncomingHttpHeaders;
      body: Buffer;
      imageRef: string;
    }>((resolve, reject) => {
      let requestPayload:
        | {
            path: string;
            method: string;
            headers: http.IncomingHttpHeaders;
            body: Buffer;
          }
        | undefined;
      let savedImageRef: string | undefined;
      let settled = false;

      const maybeResolve = () => {
        if (settled || !requestPayload || !savedImageRef) {
          return;
        }
        settled = true;
        resolve({
          ...requestPayload,
          imageRef: savedImageRef,
        });
      };

      const server = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) =>
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
        );
        req.on('end', () => {
          res.statusCode = 200;
          res.end('');
          requestPayload = {
            path: req.url || '',
            method: req.method || '',
            headers: req.headers,
            body: Buffer.concat(chunks),
          };
          maybeResolve();
        });
      });

      server.on('error', reject);
      server.listen(0, '127.0.0.1', async () => {
        try {
          const address = server.address();
          if (!address || typeof address === 'string') {
            throw new Error('Failed to bind local test server');
          }

          const storage = new S3CompatibleImageStorage({
            ...config,
            endpoint: `http://127.0.0.1:${address.port}`,
            objectKeyPrefix: 'staging',
            sessionToken: 'upload-session-token',
            requestTimeoutMs: 5000,
          });

          savedImageRef = await storage.save({
            base64: Buffer.from('hello-image').toString('base64'),
            mimeType: 'image/png',
            objectKey: 'chat-images/2026/02/user-42/session-abc/custom.png',
          });
          maybeResolve();
          setImmediate(() => server.close());
        } catch (error) {
          server.close();
          reject(error);
        }
      });
    });

    expect(received.method).toBe('PUT');
    expect(received.path).toBe(
      '/museum-private/staging/chat-images/2026/02/user-42/session-abc/custom.png',
    );
    expect(received.headers['content-type']).toBe('image/png');
    expect(received.headers.authorization).toContain('AWS4-HMAC-SHA256');
    expect(received.headers['x-amz-date']).toEqual(expect.any(String));
    expect(received.headers['x-amz-content-sha256']).toMatch(/^[a-f0-9]{64}$/);
    expect(received.headers['x-amz-security-token']).toBe('upload-session-token');
    expect(received.body.toString('utf8')).toBe('hello-image');
    expect(received.imageRef).toBe(
      's3://staging/chat-images/2026/02/user-42/session-abc/custom.png',
    );
  });

  describe('listObjectsByPrefix', () => {
    it('parses ListObjectsV2 XML response and extracts keys', async () => {
      const listXml = `<?xml version="1.0" encoding="UTF-8"?>
        <ListBucketResult>
          <IsTruncated>false</IsTruncated>
          <Contents><Key>chat-images/2026/03/user-42/session-1/a.png</Key></Contents>
          <Contents><Key>chat-images/2026/03/user-42/session-2/b.jpg</Key></Contents>
          <Contents><Key>chat-images/2026/03/user-99/session-3/c.png</Key></Contents>
        </ListBucketResult>`;

      const result = await withTestServer(listXml, async (port) => {
        return listObjectsByPrefix(
          { ...config, endpoint: `http://127.0.0.1:${port}`, requestTimeoutMs: 5000 },
          'chat-images/',
        );
      });

      expect(result.keys).toEqual([
        'chat-images/2026/03/user-42/session-1/a.png',
        'chat-images/2026/03/user-42/session-2/b.jpg',
        'chat-images/2026/03/user-99/session-3/c.png',
      ]);
      expect(result.nextToken).toBeUndefined();
    });

    it('handles truncated responses with continuation token', async () => {
      const listXml = `<?xml version="1.0" encoding="UTF-8"?>
        <ListBucketResult>
          <IsTruncated>true</IsTruncated>
          <NextContinuationToken>token-abc-123</NextContinuationToken>
          <Contents><Key>chat-images/2026/03/user-1/s/a.png</Key></Contents>
        </ListBucketResult>`;

      const result = await withTestServer(listXml, async (port) => {
        return listObjectsByPrefix(
          { ...config, endpoint: `http://127.0.0.1:${port}`, requestTimeoutMs: 5000 },
          'chat-images/',
        );
      });

      expect(result.keys).toEqual(['chat-images/2026/03/user-1/s/a.png']);
      expect(result.nextToken).toBe('token-abc-123');
    });
  });

  describe('deleteObjectsBatch', () => {
    it('sends correct DeleteObjects XML with Content-MD5', async () => {
      const keys = ['chat-images/2026/03/user-42/s1/a.png', 'chat-images/2026/03/user-42/s2/b.jpg'];

      const received = await withTestServer('', async (port) => {
        await deleteObjectsBatch(
          { ...config, endpoint: `http://127.0.0.1:${port}`, requestTimeoutMs: 5000 },
          keys,
        );
        return null;
      }, true);

      expect(received.method).toBe('POST');
      expect(received.path).toContain('?delete=');
      expect(received.body).toContain('<Delete>');
      expect(received.body).toContain('<Quiet>true</Quiet>');
      expect(received.body).toContain('<Key>chat-images/2026/03/user-42/s1/a.png</Key>');
      expect(received.body).toContain('<Key>chat-images/2026/03/user-42/s2/b.jpg</Key>');
      expect(received.headers['content-md5']).toBeTruthy();
      expect(received.headers['content-type']).toBe('application/xml');
    });

    it('is a no-op for empty key list', async () => {
      // Should not throw or make any request
      await deleteObjectsBatch(config, []);
    });
  });

  describe('deleteByPrefix integration', () => {
    it('lists and deletes only matching user keys', async () => {
      const requests: Array<{ method: string; path: string; body: string }> = [];
      const listXml = `<?xml version="1.0" encoding="UTF-8"?>
        <ListBucketResult>
          <IsTruncated>false</IsTruncated>
          <Contents><Key>chat-images/2026/03/user-42/s1/a.png</Key></Contents>
          <Contents><Key>chat-images/2026/03/user-42/s2/b.jpg</Key></Contents>
          <Contents><Key>chat-images/2026/03/user-99/s3/c.png</Key></Contents>
        </ListBucketResult>`;

      await new Promise<void>((resolve, reject) => {
        const server = http.createServer((req, res) => {
          const chunks: Buffer[] = [];
          req.on('data', (chunk) =>
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
          );
          req.on('end', () => {
            requests.push({
              method: req.method || '',
              path: req.url || '',
              body: Buffer.concat(chunks).toString('utf8'),
            });
            res.statusCode = 200;
            // Return list XML for GET, empty for POST
            res.end(req.method === 'GET' ? listXml : '');
          });
        });

        server.listen(0, '127.0.0.1', async () => {
          try {
            const address = server.address();
            if (!address || typeof address === 'string') throw new Error('bind failed');

            const storage = new S3CompatibleImageStorage({
              ...config,
              endpoint: `http://127.0.0.1:${address.port}`,
              requestTimeoutMs: 5000,
            });

            await storage.deleteByPrefix('user-42');
            server.close();
            resolve();
          } catch (err) {
            server.close();
            reject(err);
          }
        });
      });

      // Expect a GET (list) and a POST (delete)
      expect(requests.length).toBe(2);
      expect(requests[0].method).toBe('GET');
      expect(requests[1].method).toBe('POST');
      // Delete body should contain user-42 keys but NOT user-99
      expect(requests[1].body).toContain('user-42/s1/a.png');
      expect(requests[1].body).toContain('user-42/s2/b.jpg');
      expect(requests[1].body).not.toContain('user-99');
    });
  });
});

interface CapturedRequest {
  method: string;
  path: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

/** Helper: spins up a local HTTP server that responds with the given body. */
async function withTestServer<T>(
  responseBody: string,
  fn: (port: number) => Promise<T>,
): Promise<T>;
async function withTestServer<T>(
  responseBody: string,
  fn: (port: number) => Promise<T>,
  captureRequest: true,
): Promise<CapturedRequest>;
async function withTestServer<T>(
  responseBody: string,
  fn: (port: number) => Promise<T>,
  captureRequest?: boolean,
): Promise<T | CapturedRequest> {
  return new Promise((resolve, reject) => {
    let captured: CapturedRequest | undefined;
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) =>
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
      );
      req.on('end', () => {
        captured = {
          method: req.method || '',
          path: req.url || '',
          headers: req.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        };
        res.statusCode = 200;
        res.end(responseBody);
      });
    });

    server.listen(0, '127.0.0.1', async () => {
      try {
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('bind failed');
        const result = await fn(address.port);
        server.close();
        resolve(captureRequest && captured ? captured : (result as T));
      } catch (err) {
        server.close();
        reject(err);
      }
    });
  });
}
