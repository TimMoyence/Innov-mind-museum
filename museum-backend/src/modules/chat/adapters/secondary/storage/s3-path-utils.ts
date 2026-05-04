/**
 * RFC 3986 percent-encodes a string, including characters `!'()*` that
 * `encodeURIComponent` leaves unencoded.
 */
export const encodeRfc3986 = (value: string): string => {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => {
    return `%${c.charCodeAt(0).toString(16).toUpperCase()}`;
  });
};

/**
 * Percent-encodes each non-empty segment of a `/`-delimited path.
 */
export const encodePathSegments = (value: string): string => {
  return value
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeRfc3986(segment))
    .join('/');
};

/**
 * Parses and validates an S3 endpoint URL, stripping trailing slashes from the pathname.
 */
export const normalizeEndpoint = (endpoint: string): URL => {
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

/**
 * Builds a full S3 object path from bucket, key, and optional endpoint base path.
 */
export const buildObjectPath = (params: {
  bucket: string;
  key: string;
  endpointPath?: string;
}): string => {
  const base = params.endpointPath?.replace(/\/+$/, '') ?? '';
  const bucketPart = encodePathSegments(params.bucket);
  const keyPart = encodePathSegments(params.key);
  return `${base}/${bucketPart}/${keyPart}`.replace(/\/{2,}/g, '/');
};

/**
 * Joins non-empty key parts into a single `/`-delimited object key.
 */
export const joinKeyParts = (...parts: (string | undefined)[]): string => {
  return parts
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .flatMap((part) => part.split('/'))
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
};

/**
 * Normalizes an object key, optionally prepending a prefix, and validates
 * against path-traversal attacks.
 */
export const normalizeObjectKey = (params: { key: string; objectKeyPrefix?: string }): string => {
  const normalized = joinKeyParts(params.objectKeyPrefix, params.key);
  if (!normalized) {
    throw new Error('S3 object key cannot be empty');
  }
  if (normalized.includes('..')) {
    throw new Error('S3 object key contains invalid path traversal');
  }
  return normalized;
};

/**
 * Resolves the base URL and full object path for a read (GET) operation,
 * accounting for public base URL overrides, bucket-in-host, and bucket-in-path
 * endpoint styles.
 */
export const buildReadBaseUrlAndPath = (params: {
  endpoint: string;
  publicBaseUrl?: string;
  bucket: string;
  key: string;
}): { url: URL; objectPath: string } => {
  const publicBaseUrl = params.publicBaseUrl?.includes('{bucket}')
    ? params.publicBaseUrl.replaceAll('{bucket}', params.bucket)
    : params.publicBaseUrl;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
  const base = normalizeEndpoint(publicBaseUrl || params.endpoint);
  const bucketPath = `/${encodePathSegments(params.bucket)}`;
  const keyPath = `/${encodePathSegments(params.key)}`;

  const hasBucketInHost = base.hostname.startsWith(`${params.bucket}.`);
  const pathname = base.pathname.replace(/\/+$/, '');
  const hasBucketInPath = pathname === bucketPath || pathname.startsWith(`${bucketPath}/`);

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
