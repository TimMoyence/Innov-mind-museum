import { badRequest } from '@shared/errors/app.error';

interface DecodedImage {
  mimeType: string;
  base64: string;
  sizeBytes: number;
}

const privateHostPatterns = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\.0\.0\.0$/,
  /^::1$/,
  /^\[::1\]$/,
  /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./,
  /^\[?fe80:/i,
  /^\[?fd[0-9a-f]{2}:/i,
  /^\[?fc[0-9a-f]{2}:/i,
  /^0x[0-9a-f]/i, // hex IP
  /^0[0-7]+\./, // octal IP
  /^::ffff:/i, // IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1)
  /^\[::ffff:/i, // bracketed IPv4-mapped IPv6
];

/**
 * Validates that the given URL is a safe HTTPS image URL (not pointing to private/internal hosts).
 * Rejects non-HTTPS, non-443 ports, and all private/reserved IP ranges.
 *
 * Note: The validated URL is never fetched by this backend — it is passed to the LLM
 * provider's API as an image reference. DNS rebinding attacks target the fetching host,
 * so the SSRF surface is on the provider side, not ours. If server-side fetching is ever
 * added (thumbnailing, caching), DNS resolution validation must be introduced here.
 *
 * @param value - The URL string to validate.
 * @returns True if the URL uses HTTPS and does not target a private host.
 */
export const isSafeImageUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    if (url.port && url.port !== '443') return false;
    return !privateHostPatterns.some((pattern) => pattern.test(url.hostname));
  } catch {
    return false;
  }
};

/**
 * Decodes a base64-encoded image from either a data-URL or raw base64 string.
 * Falls back to `image/jpeg` when no MIME type prefix is present.
 *
 * @param input - A data-URL (`data:image/...;base64,...`) or raw base64 string.
 * @returns The decoded MIME type, clean base64 payload, and byte size.
 */
export const decodeBase64Image = (input: string): DecodedImage => {
  const dataUrlMatch = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(input);
  if (dataUrlMatch) {
    const base64 = dataUrlMatch[2];
    const sizeBytes = Buffer.from(base64, 'base64').byteLength;
    return {
      mimeType: dataUrlMatch[1],
      base64,
      sizeBytes,
    };
  }

  const normalized = input.replace(/\s/g, '');
  const sizeBytes = Buffer.from(normalized, 'base64').byteLength;
  return {
    mimeType: 'image/jpeg',
    base64: normalized,
    sizeBytes,
  };
};

/**
 * Throws a 400 error if the image exceeds the allowed byte size.
 *
 * @param sizeBytes - Actual image size in bytes.
 * @param maxBytes - Maximum allowed size in bytes.
 * @throws {AppError} 400 when sizeBytes > maxBytes.
 */
export const assertImageSize = (sizeBytes: number, maxBytes: number): void => {
  if (sizeBytes > maxBytes) {
    throw badRequest(`Image exceeds max size of ${String(maxBytes)} bytes`);
  }
};

/**
 * Throws a 400 error if the MIME type is not in the allowed list.
 *
 * @param mimeType - The image MIME type to validate.
 * @param allowed - Array of permitted MIME types.
 * @throws {AppError} 400 when the MIME type is not allowed.
 */
export const assertMimeType = (mimeType: string, allowed: string[]): void => {
  if (!allowed.includes(mimeType)) {
    throw badRequest(`Unsupported image mime type: ${mimeType}`);
  }
};

/** Known image format magic byte signatures. */
const IMAGE_SIGNATURES: { mime: string; bytes: number[]; offset?: number }[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
];

/**
 * Detects the MIME type of a base64-encoded image by inspecting its leading magic bytes.
 *
 * @param base64 - Raw base64-encoded image data (no data-URL prefix).
 * @returns The detected MIME type string, or null if no known signature matches.
 */
export const detectImageMimeFromBytes = (base64: string): string | null => {
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length < 12) return null;

  for (const sig of IMAGE_SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (buffer.length < offset + sig.bytes.length) continue;
    if (sig.bytes.every((b, i) => buffer[offset + i] === b)) {
      return sig.mime;
    }
  }
  return null;
};

/**
 * Throws a 400 error if the base64 data does not start with a known image magic byte signature.
 * This is a defense-in-depth check that validates actual file content, not just the declared MIME type.
 *
 * @param base64 - Raw base64-encoded image data (no data-URL prefix).
 * @throws {AppError} 400 when no known image signature is found.
 */
export const assertMagicBytes = (base64: string): void => {
  const detected = detectImageMimeFromBytes(base64);
  if (!detected) {
    throw badRequest('Uploaded file does not appear to be a valid image');
  }
};
