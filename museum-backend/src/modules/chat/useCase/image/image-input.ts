import { invalidInput } from '@shared/errors/app.error';

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
  /^0x[0-9a-f]/i,
  /^0[0-7]+\./,
  /^::ffff:/i,
  /^\[::ffff:/i,
];

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

export const assertImageSize = (sizeBytes: number, maxBytes: number): void => {
  if (sizeBytes > maxBytes) {
    throw invalidInput(`Image exceeds max size of ${String(maxBytes)} bytes`);
  }
};

export const assertMimeType = (mimeType: string, allowed: string[]): void => {
  if (!allowed.includes(mimeType)) {
    throw invalidInput(`Unsupported image mime type: ${mimeType}`);
  }
};

const IMAGE_SIGNATURES: { mime: string; bytes: number[]; offset?: number }[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
];

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

export const assertMagicBytes = (base64: string): void => {
  const detected = detectImageMimeFromBytes(base64);
  if (!detected) {
    throw invalidInput('Uploaded file does not appear to be a valid image');
  }
};
