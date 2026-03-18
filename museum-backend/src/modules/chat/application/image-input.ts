import { badRequest } from '@shared/errors/app.error';

interface DecodedImage {
  mimeType: string;
  base64: string;
  sizeBytes: number;
}

const privateHostPatterns = [/^localhost$/i, /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./];

/**
 * Validates that the given URL is a safe HTTPS image URL (not pointing to private/internal hosts).
 * @param value - The URL string to validate.
 * @returns True if the URL uses HTTPS and does not target a private host.
 */
export const isSafeImageUrl = (value: string): boolean => {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') {
      return false;
    }

    return !privateHostPatterns.some((pattern) => pattern.test(url.hostname));
  } catch {
    return false;
  }
};

/**
 * Decodes a base64-encoded image from either a data-URL or raw base64 string.
 * Falls back to `image/jpeg` when no MIME type prefix is present.
 * @param input - A data-URL (`data:image/...;base64,...`) or raw base64 string.
 * @returns The decoded MIME type, clean base64 payload, and byte size.
 */
export const decodeBase64Image = (input: string): DecodedImage => {
  const dataUrlMatch = input.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
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
 * @param sizeBytes - Actual image size in bytes.
 * @param maxBytes - Maximum allowed size in bytes.
 * @throws {AppError} 400 when sizeBytes > maxBytes.
 */
export const assertImageSize = (
  sizeBytes: number,
  maxBytes: number,
): void => {
  if (sizeBytes > maxBytes) {
    throw badRequest(`Image exceeds max size of ${maxBytes} bytes`);
  }
};

/**
 * Throws a 400 error if the MIME type is not in the allowed list.
 * @param mimeType - The image MIME type to validate.
 * @param allowed - Array of permitted MIME types.
 * @throws {AppError} 400 when the MIME type is not allowed.
 */
export const assertMimeType = (
  mimeType: string,
  allowed: string[],
): void => {
  if (!allowed.includes(mimeType)) {
    throw badRequest(`Unsupported image mime type: ${mimeType}`);
  }
};
