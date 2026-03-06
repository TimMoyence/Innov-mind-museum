import { badRequest } from '@shared/errors/app.error';

interface DecodedImage {
  mimeType: string;
  base64: string;
  sizeBytes: number;
}

const privateHostPatterns = [/^localhost$/i, /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./];

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

export const assertImageSize = (
  sizeBytes: number,
  maxBytes: number,
): void => {
  if (sizeBytes > maxBytes) {
    throw badRequest(`Image exceeds max size of ${maxBytes} bytes`);
  }
};

export const assertMimeType = (
  mimeType: string,
  allowed: string[],
): void => {
  if (!allowed.includes(mimeType)) {
    throw badRequest(`Unsupported image mime type: ${mimeType}`);
  }
};
