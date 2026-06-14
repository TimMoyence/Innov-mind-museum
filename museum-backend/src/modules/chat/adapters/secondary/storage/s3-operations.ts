import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';

import {
  encodeRfc3986,
  encodePathSegments,
  normalizeEndpoint,
  buildObjectPath,
  buildReadBaseUrlAndPath,
} from './s3-path-utils';
import { sha256Hex, toAmzDate, buildCanonicalHeaders, signString } from './s3-signing';

/** Shared across image and audio adapters. */
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

/** AWS SigV4 canonical format. */
export const canonicalQueryString = (query: [string, string][]): string => {
  return [...query]
    .sort((a, b) => {
      if (a[0] === b[0]) return a[1].localeCompare(b[1]);
      return a[0].localeCompare(b[0]);
    })
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join('&');
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

    req.on('error', (error) => {
      finish(error);
    });
    if (params.body) req.write(params.body);
    req.end();
  });
};

/** Throws if response is not 2xx. */
export const httpPut = async (params: {
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

export const buildS3SignedHeadersForPut = (params: {
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

  // SigV4 Authorization = "<algo> Credential=...,SignedHeaders=...,Signature=..."
  // — a SPACE separates the algorithm from the comma-joined params. Joining the
  // algorithm into the comma list (`AWS4-HMAC-SHA256, Credential=...`) is accepted
  // by AWS S3 but REJECTED by OVH/Swift's stricter parser, which then returns a
  // misleading `AWS authentication requires a valid Date or x-amz-date header`
  // 403 — the real root cause of INC-2026-06-14 (all object-store writes 403'd
  // against OVH while the same creds worked via aws-cli).
  const authorization =
    'AWS4-HMAC-SHA256 ' +
    [
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
      ...(params.config.sessionToken ? { 'X-Amz-Security-Token': params.config.sessionToken } : {}),
      Authorization: authorization,
    },
  };
};

export const buildS3SignedHeaders = (params: {
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

  // SigV4 Authorization = "<algo> Credential=...,SignedHeaders=...,Signature=..."
  // — a SPACE separates the algorithm from the comma-joined params. Joining the
  // algorithm into the comma list (`AWS4-HMAC-SHA256, Credential=...`) is accepted
  // by AWS S3 but REJECTED by OVH/Swift's stricter parser, which then returns a
  // misleading `AWS authentication requires a valid Date or x-amz-date header`
  // 403 — the real root cause of INC-2026-06-14 (all object-store writes 403'd
  // against OVH while the same creds worked via aws-cli).
  const authorization =
    'AWS4-HMAC-SHA256 ' +
    [
      `Credential=${params.config.accessKeyId}/${scope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`,
    ].join(', ');

  return {
    'X-Amz-Content-Sha256': params.payloadHash,
    'X-Amz-Date': amzDate,
    ...(params.config.sessionToken ? { 'X-Amz-Security-Token': params.config.sessionToken } : {}),
    Authorization: authorization,
  };
};

/** One listed S3 object paired with its parsed `LastModified` (epoch ms). */
export interface ListedObject {
  key: string;
  lastModifiedMs: number;
}

interface ListObjectsResult {
  /**
   * Each listed object paired `{ key, lastModifiedMs }`, parsed per `<Contents>`
   * block so `Key` correlates with its `LastModified` (the orphan-purge age
   * filter needs the real per-object timestamp, not a flat list of keys).
   */
  objects: ListedObject[];
  nextToken?: string;
}

const escapeXmlTag = (tag: string): string => tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractXmlValue = (xml: string, tag: string): string | undefined => {
  const escaped = escapeXmlTag(tag);
  // eslint-disable-next-line security/detect-non-literal-regexp -- tag is escaped via escapeXmlTag above; callers pass literal S3 XML tag names only
  const match = new RegExp(`<${escaped}>([^<]*)</${escaped}>`).exec(xml); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  return match?.[1];
};

export const listObjectsByPrefix = async (
  config: S3ImageStorageConfig,
  prefix: string,
  continuationToken?: string,
): Promise<ListObjectsResult> => {
  const endpoint = normalizeEndpoint(config.endpoint);
  const bucketPath = `/${encodePathSegments(config.bucket)}`;
  // eslint-disable-next-line sonarjs/slow-regex -- `/\/+$/` anchored at end on a single char class, no alternation: linear time
  const objectPath = `${endpoint.pathname.replace(/\/+$/, '')}${bucketPath}`.replace(
    /\/{2,}/g,
    '/',
  );

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

  const objects = parseContentsObjects(body);
  const isTruncated = extractXmlValue(body, 'IsTruncated') === 'true';
  const nextToken = isTruncated ? extractXmlValue(body, 'NextContinuationToken') : undefined;

  return { objects, nextToken };
};

/**
 * Parses each `<Contents>…</Contents>` block of a ListObjectsV2 response so the
 * `<Key>` correlates with its own `<LastModified>` (the flat `extractXmlValues`
 * cannot pair the two). `LastModified` is the S3 ISO-8601 timestamp → epoch ms
 * via `Date.parse`; an unparseable/absent timestamp falls back to `0` (treated
 * as "old enough" by the age filter, so the DB-reference net stays authoritative).
 */
const parseContentsObjects = (xml: string): ListedObject[] => {
  const objects: ListedObject[] = [];
  // `[\s\S]*?` (non-greedy) so each block stops at its own closing tag; the
  // single literal pattern is linear (no nested alternation / backtracking trap).
  const blockRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
  for (const block of xml.matchAll(blockRegex)) {
    const inner = block[1];
    const key = extractXmlValue(inner, 'Key');
    if (key === undefined) continue;
    const lastModifiedIso = extractXmlValue(inner, 'LastModified');
    const parsed = lastModifiedIso ? Date.parse(lastModifiedIso) : Number.NaN;
    objects.push({ key, lastModifiedMs: Number.isNaN(parsed) ? 0 : parsed });
  }
  return objects;
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
  // eslint-disable-next-line sonarjs/slow-regex -- `/\/+$/` anchored at end on a single char class, no alternation: linear time
  const objectPath = `${endpoint.pathname.replace(/\/+$/, '')}${bucketPath}`.replace(
    /\/{2,}/g,
    '/',
  );

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

/** Shared by image + audio adapters — extracted to avoid adapter→adapter coupling. */
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
    [
      'X-Amz-Credential',
      `${params.config.accessKeyId}/${dateStamp}/${params.config.region}/s3/aws4_request`,
    ],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(ttlSeconds)],
    ['X-Amz-SignedHeaders', 'host'],
  ];
  if (params.config.sessionToken) {
    query.push(['X-Amz-Security-Token', params.config.sessionToken]);
  }

  const canonicalReq = [
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
    canonicalRequest: canonicalReq,
  });

  query.push(['X-Amz-Signature', signature]);
  url.search = canonicalQueryString(query);

  return {
    url: url.toString(),
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000).toISOString(),
  };
};
