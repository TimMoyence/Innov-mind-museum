import crypto, { randomUUID } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';

import { startSpan } from '@shared/observability/sentry';

import type { ImageStorage, SaveImageInput } from './image-storage.stub';

/** Configuration for an S3-compatible image storage backend. */
export interface S3ImageStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  signedUrlTtlSeconds: number;
  publicBaseUrl?: string;
  sessionToken?: string;
  objectKeyPrefix?: string;
  requestTimeoutMs?: number;
}

const extensionByMime: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const encodeRfc3986 = (value: string): string => {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => {
    return `%${c.charCodeAt(0).toString(16).toUpperCase()}`;
  });
};

const encodePathSegments = (value: string): string => {
  return value
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeRfc3986(segment))
    .join('/');
};

const sha256Hex = (value: Buffer | string): string => {
  return crypto.createHash('sha256').update(value).digest('hex');
};

const hmac = (key: Buffer | string, value: string): Buffer => {
  return crypto.createHmac('sha256', key).update(value).digest();
};

const deriveSigningKey = (secretAccessKey: string, dateStamp: string, region: string): Buffer => {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
};

const toAmzDate = (date: Date): { amzDate: string; dateStamp: string } => {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
};

const normalizeEndpoint = (endpoint: string): URL => {
  const trimmed = endpoint.trim();
  if (!trimmed) {
    throw new Error('S3 endpoint is required');
  }
  const url = new URL(trimmed);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('S3 endpoint must use http or https');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url;
};

const buildObjectPath = (params: { bucket: string; key: string; endpointPath?: string }): string => {
  const base = params.endpointPath?.replace(/\/+$/, '') ?? '';
  const bucketPart = encodePathSegments(params.bucket);
  const keyPart = encodePathSegments(params.key);
  return `${base}/${bucketPart}/${keyPart}`.replace(/\/{2,}/g, '/');
};

const joinKeyParts = (...parts: (string | undefined)[]): string => {
  return parts
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .flatMap((part) => part.split('/'))
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
};

const normalizeObjectKey = (params: {
  key: string;
  objectKeyPrefix?: string;
}): string => {
  const normalized = joinKeyParts(params.objectKeyPrefix, params.key);
  if (!normalized) {
    throw new Error('S3 object key cannot be empty');
  }
  if (normalized.includes('..')) {
    throw new Error('S3 object key contains invalid path traversal');
  }
  return normalized;
};

const buildReadBaseUrlAndPath = (params: {
  endpoint: string;
  publicBaseUrl?: string;
  bucket: string;
  key: string;
}): { url: URL; objectPath: string } => {
  const publicBaseUrl =
    params.publicBaseUrl?.includes('{bucket}')
      ? params.publicBaseUrl.replaceAll('{bucket}', params.bucket)
      : params.publicBaseUrl;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
  const base = normalizeEndpoint(publicBaseUrl || params.endpoint);
  const bucketPath = `/${encodePathSegments(params.bucket)}`;
  const keyPath = `/${encodePathSegments(params.key)}`;

  const hasBucketInHost = base.hostname.startsWith(`${params.bucket}.`);
  const pathname = base.pathname.replace(/\/+$/, '');
  const hasBucketInPath =
    pathname === bucketPath || pathname.startsWith(`${bucketPath}/`);

  let objectPath: string;
  if (hasBucketInHost) {
    objectPath = `${pathname}${keyPath}`.replace(/\/{2,}/g, '/');
  } else if (hasBucketInPath) {
    objectPath = `${pathname}${keyPath}`.replace(/\/{2,}/g, '/');
  } else {
    objectPath = buildObjectPath({
      bucket: params.bucket,
      key: params.key,
      endpointPath: base.pathname,
    });
  }

  const url = new URL(base.toString());
  url.pathname = objectPath;
  url.search = '';

  return { url, objectPath };
};

const canonicalQueryString = (query: [string, string][]): string => {
  return [...query]
    .sort((a, b) => {
      if (a[0] === b[0]) return a[1].localeCompare(b[1]);
      return a[0].localeCompare(b[0]);
    })
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join('&');
};

const buildCanonicalHeaders = (headers: Record<string, string>): {
  canonicalHeaders: string;
  signedHeaders: string;
} => {
  const normalized = Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase().trim(), value.trim().replace(/\s+/g, ' ')] as const)
    .sort(([a], [b]) => a.localeCompare(b));

  return {
    canonicalHeaders: normalized.map(([k, v]) => `${k}:${v}\n`).join(''),
    signedHeaders: normalized.map(([k]) => k).join(';'),
  };
};

const signString = (params: {
  secretAccessKey: string;
  dateStamp: string;
  region: string;
  amzDate: string;
  canonicalRequest: string;
}): { scope: string; signature: string } => {
  const scope = `${params.dateStamp}/${params.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    params.amzDate,
    scope,
    sha256Hex(params.canonicalRequest),
  ].join('\n');
  const signingKey = deriveSigningKey(params.secretAccessKey, params.dateStamp, params.region);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return { scope, signature };
};

const httpRequest = async (params: {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body?: Buffer;
  timeoutMs?: number;
}): Promise<{ statusCode: number; body: string }> => {
  const client = params.url.protocol === 'https:' ? https : http;
  return await new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err: Error | null, result?: { statusCode: number; body: string }) => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(result ?? { statusCode: 0, body: '' });
    };

    const reqHeaders: Record<string, string> = { ...params.headers };
    if (params.body) {
      reqHeaders['Content-Length'] = String(params.body.byteLength);
    }

    const req = client.request(
      params.url,
      { method: params.method, headers: reqHeaders },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer | string) =>
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
        );
        res.on('end', () => {
          const statusCode = res.statusCode ?? 0;
          const bodyText = Buffer.concat(chunks).toString('utf8');
          finish(null, { statusCode, body: bodyText });
        });
      },
    );

    if (params.timeoutMs && params.timeoutMs > 0) {
      req.setTimeout(params.timeoutMs, () => {
        req.destroy(new Error(`S3 request timed out after ${params.timeoutMs}ms`));
      });
    }

    req.on('error', (error) => { finish(error); });
    if (params.body) req.write(params.body);
    req.end();
  });
};

const httpPut = async (params: {
  url: URL;
  headers: Record<string, string>;
  body: Buffer;
  timeoutMs?: number;
}): Promise<void> => {
  const { statusCode, body } = await httpRequest({
    method: 'PUT',
    url: params.url,
    headers: params.headers,
    body: params.body,
    timeoutMs: params.timeoutMs,
  });
  if (statusCode < 200 || statusCode >= 300) {
    const detail = body ? ': ' + body.slice(0, 500) : '';
    throw new Error(`S3 upload failed (${statusCode})${detail}`);
  }
};

const buildS3SignedHeadersForPut = (params: {
  config: S3ImageStorageConfig;
  key: string;
  body: Buffer;
  contentType: string;
  now?: Date;
}): { url: URL; headers: Record<string, string> } => {
  const endpoint = normalizeEndpoint(params.config.endpoint);
  const host = endpoint.host;
  const objectPath = buildObjectPath({
    bucket: params.config.bucket,
    key: params.key,
    endpointPath: endpoint.pathname,
  });
  const url = new URL(endpoint.toString());
  url.pathname = objectPath;
  url.search = '';

  const now = params.now ?? new Date();
  const { amzDate, dateStamp } = toAmzDate(now);
  const payloadHash = sha256Hex(params.body);
  const headersToSign: Record<string, string> = {
    host,
    'content-type': params.contentType,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (params.config.sessionToken) {
    headersToSign['x-amz-security-token'] = params.config.sessionToken;
  }
  const { canonicalHeaders, signedHeaders } = buildCanonicalHeaders(headersToSign);

  const canonicalRequest = [
    'PUT',
    objectPath,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const { scope, signature } = signString({
    secretAccessKey: params.config.secretAccessKey,
    dateStamp,
    region: params.config.region,
    amzDate,
    canonicalRequest,
  });

  const authorization = [
    'AWS4-HMAC-SHA256',
    `Credential=${params.config.accessKeyId}/${scope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');

  return {
    url,
    headers: {
      'Content-Type': params.contentType,
      'X-Amz-Content-Sha256': payloadHash,
      'X-Amz-Date': amzDate,
      ...(params.config.sessionToken
        ? { 'X-Amz-Security-Token': params.config.sessionToken }
        : {}),
      Authorization: authorization,
    },
  };
};

/**
 * Extracts the S3 object key from an `s3://` image reference.
 *
 * @param imageRef - Storage reference string.
 * @returns An object containing the key, or `null` if the reference is not an S3 URI.
 */
export const parseS3ImageRef = (imageRef: string): { key: string } | null => {
  const match = /^s3:\/\/(.+)$/.exec(imageRef);
  if (!match?.[1]) {
    return null;
  }

  return { key: match[1] };
};

/**
 * Checks whether a storage reference is an S3 URI (`s3://...`).
 *
 * @param imageRef - Storage reference string (may be null/undefined).
 * @returns `true` if the reference starts with `s3://`.
 */
export const isS3ImageRef = (imageRef: string | null | undefined): boolean => {
  return typeof imageRef === 'string' && imageRef.startsWith("s3://");
};

/**
 * Builds an `s3://` storage reference from an object key.
 *
 * @param key - S3 object key.
 * @returns An `s3://<key>` URI.
 */
export const buildS3ImageRef = (key: string): string => {
  return `s3://${key}`;
};

/**
 * Generates a pre-signed GET URL from an `s3://` image reference.
 *
 * @param params - Image reference, S3 config, optional TTL and timestamp.
 * @param params.imageRef - S3 image reference string (e.g. `s3://key`).
 * @param params.config - S3 connection and bucket configuration.
 * @param params.ttlSeconds - Optional TTL in seconds for the signed URL.
 * @param params.now - Optional timestamp override for signature generation.
 * @returns Signed URL and expiry timestamp, or `null` if the reference is not a valid S3 URI.
 */
export const buildS3SignedReadUrlFromRef = (params: {
  imageRef: string;
  config: S3ImageStorageConfig;
  ttlSeconds?: number;
  now?: Date;
}): { url: string; expiresAt: string } | null => {
  const parsed = parseS3ImageRef(params.imageRef);
  if (!parsed) {
    return null;
  }

  return buildS3PresignedReadUrl({
    key: parsed.key,
    config: params.config,
    ttlSeconds: params.ttlSeconds,
    now: params.now,
  });
};

/**
 * Generates an AWS SigV4 pre-signed GET URL for an S3 object.
 *
 * @param params - Object key, S3 config, optional TTL and timestamp.
 * @param params.key - S3 object key.
 * @param params.config - S3 connection and bucket configuration.
 * @param params.ttlSeconds - Optional TTL in seconds for the signed URL.
 * @param params.now - Optional timestamp override for signature generation.
 * @returns The signed URL and its ISO-8601 expiry.
 */
export const buildS3PresignedReadUrl = (params: {
  key: string;
  config: S3ImageStorageConfig;
  ttlSeconds?: number;
  now?: Date;
}): { url: string; expiresAt: string } => {
  const { url, objectPath } = buildReadBaseUrlAndPath({
    endpoint: params.config.endpoint,
    publicBaseUrl: params.config.publicBaseUrl,
    bucket: params.config.bucket,
    key: params.key,
  });

  const now = params.now ?? new Date();
  const { amzDate, dateStamp } = toAmzDate(now);
  const ttlSeconds = Math.max(
    30,
    Math.min(60 * 60 * 24 * 7, params.ttlSeconds ?? params.config.signedUrlTtlSeconds),
  );
  const query: [string, string][] = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${params.config.accessKeyId}/${dateStamp}/${params.config.region}/s3/aws4_request`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(ttlSeconds)],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  if (params.config.sessionToken) {
    query.push(['X-Amz-Security-Token', params.config.sessionToken]);
  }

  const canonicalRequest = [
    'GET',
    objectPath,
    canonicalQueryString(query),
    `host:${url.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const { signature } = signString({
    secretAccessKey: params.config.secretAccessKey,
    dateStamp,
    region: params.config.region,
    amzDate,
    canonicalRequest,
  });

  query.push(['X-Amz-Signature', signature]);
  url.search = canonicalQueryString(query);

  return {
    url: url.toString(),
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
  };
};

const buildS3SignedHeaders = (params: {
  config: S3ImageStorageConfig;
  method: string;
  path: string;
  queryString: string;
  headers: Record<string, string>;
  payloadHash: string;
  now?: Date;
}): Record<string, string> => {
  const now = params.now ?? new Date();
  const { amzDate, dateStamp } = toAmzDate(now);
  const headersToSign: Record<string, string> = {
    ...params.headers,
    'x-amz-content-sha256': params.payloadHash,
    'x-amz-date': amzDate,
  };
  if (params.config.sessionToken) {
    headersToSign['x-amz-security-token'] = params.config.sessionToken;
  }
  const { canonicalHeaders, signedHeaders } = buildCanonicalHeaders(headersToSign);

  const canonicalRequest = [
    params.method,
    params.path,
    params.queryString,
    canonicalHeaders,
    signedHeaders,
    params.payloadHash,
  ].join('\n');

  const { scope, signature } = signString({
    secretAccessKey: params.config.secretAccessKey,
    dateStamp,
    region: params.config.region,
    amzDate,
    canonicalRequest,
  });

  const authorization = [
    'AWS4-HMAC-SHA256',
    `Credential=${params.config.accessKeyId}/${scope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');

  return {
    'X-Amz-Content-Sha256': params.payloadHash,
    'X-Amz-Date': amzDate,
    ...(params.config.sessionToken
      ? { 'X-Amz-Security-Token': params.config.sessionToken }
      : {}),
    Authorization: authorization,
  };
};

interface ListObjectsResult {
  keys: string[];
  nextToken?: string;
}

const extractXmlValues = (xml: string, tag: string): string[] => {
  const results: string[] = [];
  const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1]);
  }
  return results;
};

const extractXmlValue = (xml: string, tag: string): string | undefined => {
  const match = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);
  return match?.[1];
};

export const listObjectsByPrefix = async (
  config: S3ImageStorageConfig,
  prefix: string,
  continuationToken?: string,
): Promise<ListObjectsResult> => {
  const endpoint = normalizeEndpoint(config.endpoint);
  const bucketPath = `/${encodePathSegments(config.bucket)}`;
  const objectPath = `${endpoint.pathname.replace(/\/+$/, '')}${bucketPath}`.replace(/\/{2,}/g, '/');

  const queryPairs: [string, string][] = [
    ['list-type', '2'],
    ['max-keys', '1000'],
    ['prefix', prefix],
  ];
  if (continuationToken) {
    queryPairs.push(['continuation-token', continuationToken]);
  }
  const qs = canonicalQueryString(queryPairs);

  const url = new URL(endpoint.toString());
  url.pathname = objectPath;
  url.search = qs;

  const payloadHash = sha256Hex('');
  const signedHeaders = buildS3SignedHeaders({
    config,
    method: 'GET',
    path: objectPath,
    queryString: qs,
    headers: { host: endpoint.host },
    payloadHash,
  });

  const { statusCode, body } = await httpRequest({
    method: 'GET',
    url,
    headers: { ...signedHeaders, Host: endpoint.host },
    timeoutMs: config.requestTimeoutMs,
  });

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`S3 ListObjectsV2 failed (${statusCode}): ${body.slice(0, 500)}`);
  }

  const keys = extractXmlValues(body, 'Key');
  const isTruncated = extractXmlValue(body, 'IsTruncated') === 'true';
  const nextToken = isTruncated ? extractXmlValue(body, 'NextContinuationToken') : undefined;

  return { keys, nextToken };
};

export const deleteObjectsBatch = async (
  config: S3ImageStorageConfig,
  keys: string[],
): Promise<void> => {
  if (keys.length === 0) return;

  const objectsXml = keys
    .map((k) => `<Object><Key>${k.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</Key></Object>`)
    .join('');
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?><Delete><Quiet>true</Quiet>${objectsXml}</Delete>`;
  const bodyBuffer = Buffer.from(xmlBody, 'utf8');

  const endpoint = normalizeEndpoint(config.endpoint);
  const bucketPath = `/${encodePathSegments(config.bucket)}`;
  const objectPath = `${endpoint.pathname.replace(/\/+$/, '')}${bucketPath}`.replace(/\/{2,}/g, '/');

  const qs = 'delete=';
  const url = new URL(endpoint.toString());
  url.pathname = objectPath;
  url.search = qs;

  const contentMd5 = crypto.createHash('md5').update(bodyBuffer).digest('base64'); // eslint-disable-line sonarjs/hashing -- S3 API requires Content-MD5 header for integrity verification
  const payloadHash = sha256Hex(bodyBuffer);
  const signedHeaders = buildS3SignedHeaders({
    config,
    method: 'POST',
    path: objectPath,
    queryString: qs,
    headers: {
      host: endpoint.host,
      'content-type': 'application/xml',
      'content-md5': contentMd5,
    },
    payloadHash,
  });

  const { statusCode, body } = await httpRequest({
    method: 'POST',
    url,
    headers: {
      ...signedHeaders,
      Host: endpoint.host,
      'Content-Type': 'application/xml',
      'Content-MD5': contentMd5,
    },
    body: bodyBuffer,
    timeoutMs: config.requestTimeoutMs,
  });

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`S3 DeleteObjects failed (${statusCode}): ${body.slice(0, 500)}`);
  }
};

/** S3-compatible implementation of {@link ImageStorage} — uploads images via signed PUT requests. */
export class S3CompatibleImageStorage implements ImageStorage {
  constructor(private readonly config: S3ImageStorageConfig) {}

  /**
   * Uploads a base64-encoded image to S3 and returns an `s3://` reference.
   *
   * @param input - Image data, MIME type, and optional object key.
   * @returns An `s3://<key>` storage reference.
   * @throws Error if the S3 PUT request fails.
   */
  async save(input: SaveImageInput): Promise<string> {
    return await startSpan({ name: 'image.upload.s3', op: 'storage.upload' }, async () => {
      const body = Buffer.from(input.base64, 'base64');
      const extension = extensionByMime[input.mimeType] || 'img';
      const now = new Date();
      const fallbackKey = [
        'chat-images',
        String(now.getUTCFullYear()),
        String(now.getUTCMonth() + 1).padStart(2, '0'),
        `${randomUUID()}.${extension}`,
      ].join('/');
      const key = normalizeObjectKey({
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
        key: input.objectKey || fallbackKey,
        objectKeyPrefix: this.config.objectKeyPrefix,
      });

      const signed = buildS3SignedHeadersForPut({
        config: this.config,
        key,
        body,
        contentType: input.mimeType,
        now,
      });

      await httpPut({
        url: signed.url,
        headers: signed.headers,
        body,
        timeoutMs: this.config.requestTimeoutMs,
      });

      return buildS3ImageRef(key);
    });
  }

  /**
   * Deletes all objects whose key contains the given user pattern (e.g. `user-42`).
   * Lists all objects under `chat-images/` and filters by pattern match.
   *
   * @param userPattern - Substring to match within object keys (e.g. `user-42`).
   */
  async deleteByPrefix(userPattern: string): Promise<void> {
    const prefix = normalizeObjectKey({
      key: 'chat-images/',
      objectKeyPrefix: this.config.objectKeyPrefix,
    });
    let continuationToken: string | undefined;
    do {
      const { keys, nextToken } = await listObjectsByPrefix(
        this.config,
        prefix,
        continuationToken,
      );
      const matching = keys.filter((k) => k.includes(`/${userPattern}/`) || k.includes(`/${userPattern}`));
      if (matching.length > 0) {
        // DeleteObjects supports max 1000 keys per call — list already returns max 1000
        await deleteObjectsBatch(this.config, matching);
      }
      continuationToken = nextToken;
    } while (continuationToken);
  }
}
