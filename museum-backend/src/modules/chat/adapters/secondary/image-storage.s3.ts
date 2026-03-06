import crypto from 'crypto';
import http from 'http';
import https from 'https';
import { randomUUID } from 'crypto';

import { ImageStorage, SaveImageInput } from './image-storage.stub';

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
  const base = params.endpointPath?.replace(/\/+$/, '') || '';
  const bucketPart = encodePathSegments(params.bucket);
  const keyPart = encodePathSegments(params.key);
  return `${base}/${bucketPart}/${keyPart}`.replace(/\/{2,}/g, '/');
};

const joinKeyParts = (...parts: Array<string | undefined>): string => {
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

const canonicalQueryString = (query: Array<[string, string]>): string => {
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
    canonicalHeaders: `${normalized.map(([k, v]) => `${k}:${v}\n`).join('')}`,
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

const httpPut = async (params: {
  url: URL;
  headers: Record<string, string>;
  body: Buffer;
  timeoutMs?: number;
}): Promise<void> => {
  const client = params.url.protocol === 'https:' ? https : http;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finishReject = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const finishResolve = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const req = client.request(
      params.url,
      {
        method: 'PUT',
        headers: {
          ...params.headers,
          'Content-Length': String(params.body.byteLength),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          const statusCode = res.statusCode || 0;
          if (statusCode >= 200 && statusCode < 300) {
            finishResolve();
            return;
          }

          const bodyText = Buffer.concat(chunks).toString('utf8').slice(0, 500);
          finishReject(
            new Error(`S3 upload failed (${statusCode})${bodyText ? `: ${bodyText}` : ''}`),
          );
        });
      },
    );

    if (params.timeoutMs && params.timeoutMs > 0) {
      req.setTimeout(params.timeoutMs, () => {
        req.destroy(new Error(`S3 upload timed out after ${params.timeoutMs}ms`));
      });
    }

    req.on('error', (error) => finishReject(error as Error));
    req.write(params.body);
    req.end();
  });
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

  const now = params.now || new Date();
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

export const parseS3ImageRef = (imageRef: string): { key: string } | null => {
  const match = imageRef.match(/^s3:\/\/(.+)$/);
  if (!match?.[1]) {
    return null;
  }

  return { key: match[1] };
};

export const isS3ImageRef = (imageRef: string | null | undefined): boolean => {
  return typeof imageRef === 'string' && /^s3:\/\//.test(imageRef);
};

export const buildS3ImageRef = (key: string): string => {
  return `s3://${key}`;
};

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

  const now = params.now || new Date();
  const { amzDate, dateStamp } = toAmzDate(now);
  const ttlSeconds = Math.max(
    30,
    Math.min(60 * 60 * 24 * 7, params.ttlSeconds ?? params.config.signedUrlTtlSeconds),
  );
  const query: Array<[string, string]> = [
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

export class S3CompatibleImageStorage implements ImageStorage {
  constructor(private readonly config: S3ImageStorageConfig) {}

  async save(input: SaveImageInput): Promise<string> {
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
  }
}
