import http from 'http';

import {
  S3CompatibleImageStorage,
  buildS3ImageRef,
  buildS3PresignedReadUrl,
  buildS3SignedReadUrlFromRef,
  isS3ImageRef,
  parseS3ImageRef,
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
});
