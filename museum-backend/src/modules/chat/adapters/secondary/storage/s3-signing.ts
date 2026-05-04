import crypto from 'node:crypto';

/**
 * Computes the SHA-256 hex digest of the given value.
 */
export const sha256Hex = (value: Buffer | string): string => {
  return crypto.createHash('sha256').update(value).digest('hex');
};

/**
 * Computes an HMAC-SHA256 digest.
 */
export const hmac = (key: Buffer | string, value: string): Buffer => {
  return crypto.createHmac('sha256', key).update(value).digest();
};

/**
 * Derives a SigV4 signing key for the `s3` service.
 */
export const deriveSigningKey = (
  secretAccessKey: string,
  dateStamp: string,
  region: string,
): Buffer => {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
};

/**
 * Converts a `Date` to the AMZ date format (`YYYYMMDDTHHMMSSZ`) and date stamp (`YYYYMMDD`).
 */
export const toAmzDate = (date: Date): { amzDate: string; dateStamp: string } => {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
};

/**
 * Normalizes and sorts headers into canonical format for SigV4 signing.
 */
export const buildCanonicalHeaders = (
  headers: Record<string, string>,
): {
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

/**
 * Signs a canonical request using AWS SigV4 and returns the scope and hex signature.
 */
export const signString = (params: {
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
