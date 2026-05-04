import multer from 'multer';

import { buildSignedChatImageReadUrl } from '@modules/chat/adapters/primary/http/chat.image-url';
import {
  buildS3SignedReadUrlFromRef,
  isS3ImageRef,
} from '@modules/chat/adapters/secondary/storage/image-storage.s3';
import { badRequest } from '@shared/errors/app.error';
import { env } from '@src/config/env';

import type { Request, RequestHandler } from 'express';

/**
 * Disables the global response timeout for multipart uploads (image messages).
 * Must be placed BEFORE multer so the timeout doesn't fire during a slow upload.
 * Uses a finite ceiling (LLM budget + 10 s headroom) instead of 0 (unlimited).
 */
export const extendTimeoutForUpload: RequestHandler = (req, res, next) => {
  if (req.is('multipart/form-data')) {
    res.setTimeout(env.llm.totalBudgetMs + 10_000);
  }
  next();
};

/** Parsed visitor context extracted from request body. */
interface ParsedContext {
  location?: string;
  museumMode?: boolean;
  guideLevel?: 'beginner' | 'intermediate' | 'expert';
  locale?: string;
}

/**
 * Default MIME types accepted by the image uploader when no explicit allowlist
 * is configured via `env.upload.allowedMimeTypes`. Matches the formats enforced
 * by `ImageProcessingService.assertMimeType` (jpeg / png / webp), which is what
 * the downstream LLM vision pipeline can process.
 */
const DEFAULT_IMAGE_MIME_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Default MIME types accepted by the audio uploader. Covers the common mobile
 * recorder outputs (iOS m4a, Android 3gp/webm, generic mp4/mpeg/wav) aligned
 * with `env.upload.allowedAudioMimeTypes`.
 */
const DEFAULT_AUDIO_MIME_TYPES: readonly string[] = [
  'audio/mp4',
  'audio/mpeg',
  'audio/webm',
  'audio/wav',
  'audio/x-m4a',
];

const resolveAllowedImageMimeTypes = (): Set<string> => {
  const configured = env.upload.allowedMimeTypes;
  const list = configured.length > 0 ? configured : DEFAULT_IMAGE_MIME_TYPES;
  return new Set(list.map((type) => type.toLowerCase()));
};

const resolveAllowedAudioMimeTypes = (): Set<string> => {
  const configured = env.upload.allowedAudioMimeTypes;
  const list = configured.length > 0 ? configured : DEFAULT_AUDIO_MIME_TYPES;
  return new Set(list.map((type) => type.toLowerCase()));
};

/**
 * Multer fileFilter that rejects an upload *before* it is buffered in memory
 * when the declared Content-Type is not in the allowlist. This is a pre-flight
 * guard to cap memory pressure under concurrent upload load (SEC-M2); the
 * authoritative validation (magic bytes + size) still runs in
 * `ImageProcessingService` / audio ingestion for defense-in-depth.
 *
 * Note: the allowlist is resolved lazily on the first call (then memoized) so
 * that test suites can mock `@src/config/env` after the module has loaded.
 */
let cachedAllowedImageMimeTypes: Set<string> | null = null;
let cachedAllowedAudioMimeTypes: Set<string> | null = null;

const imageFileFilter: NonNullable<multer.Options['fileFilter']> = (_req, file, cb) => {
  cachedAllowedImageMimeTypes ??= resolveAllowedImageMimeTypes();
  const mime = (file.mimetype || '').toLowerCase();
  if (cachedAllowedImageMimeTypes.has(mime)) {
    cb(null, true);
    return;
  }
  cb(badRequest(`Unsupported image content type: ${file.mimetype || 'unknown'}`));
};

const audioFileFilter: NonNullable<multer.Options['fileFilter']> = (_req, file, cb) => {
  cachedAllowedAudioMimeTypes ??= resolveAllowedAudioMimeTypes();
  const mime = (file.mimetype || '').toLowerCase();
  if (cachedAllowedAudioMimeTypes.has(mime)) {
    cb(null, true);
    return;
  }
  cb(badRequest(`Unsupported audio content type: ${file.mimetype || 'unknown'}`));
};

/** Multer instance for image uploads (single file, size-limited, MIME-filtered). */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.llm.maxImageBytes,
    files: 1,
  },
  fileFilter: imageFileFilter,
});

/** Multer instance for audio uploads (single file, size-limited, MIME-filtered). */
export const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.llm.maxAudioBytes,
    files: 1,
  },
  fileFilter: audioFileFilter,
});

const MAX_CONTEXT_LENGTH = 2000;

/** Throws 400 if the serialised context exceeds the size cap. */
const enforceContextSizeLimit = (input: unknown): void => {
  let len = 0;
  if (typeof input === 'string') len = input.length;
  else if (typeof input === 'object' && input !== null) len = JSON.stringify(input).length;
  if (len > MAX_CONTEXT_LENGTH) {
    throw badRequest('context payload too large');
  }
};

/** Parses a JSON string or passes through a non-string value, validating it is an object. */
const parseRawContextObject = (input: unknown): Record<string, unknown> => {
  let raw = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      throw badRequest('context must be valid JSON when provided as string');
    }
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw badRequest('context must be an object');
  }

  return raw as Record<string, unknown>;
};

/** Validates and extracts context.location. */
const parseLocation = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw badRequest('context.location must be a string');
  return value;
};

/** Validates and extracts context.museumMode (boolean or boolean-string). */
const parseMuseumMode = (value: unknown): boolean | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }
  throw badRequest('context.museumMode must be a boolean');
};

/** Validates and extracts context.guideLevel. */
const parseGuideLevel = (value: unknown): ParsedContext['guideLevel'] | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw badRequest('context.guideLevel must be a string');
  if (!['beginner', 'intermediate', 'expert'].includes(value)) {
    throw badRequest('context.guideLevel must be beginner, intermediate, or expert');
  }
  return value as 'beginner' | 'intermediate' | 'expert';
};

/** Validates and extracts context.locale (length + charset cap; whitelist happens downstream via resolveLocale). */
const parseLocale = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw badRequest('context.locale must be a string');
  if (value.length > 10) throw badRequest('context.locale is too long');
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    throw badRequest('context.locale must match BCP47 charset (alnum, dash, underscore)');
  }
  return value;
};

/** Parses and validates the optional context object from the request body. */
export const parseContext = (input: unknown): ParsedContext | undefined => {
  if (input === undefined || input === null || input === '') {
    return undefined;
  }

  enforceContextSizeLimit(input);

  const value = parseRawContextObject(input);

  const context: ParsedContext = {};
  const location = parseLocation(value.location);
  if (location !== undefined) context.location = location;

  const museumMode = parseMuseumMode(value.museumMode);
  if (museumMode !== undefined) context.museumMode = museumMode;

  const guideLevel = parseGuideLevel(value.guideLevel);
  if (guideLevel !== undefined) context.guideLevel = guideLevel;

  const locale = parseLocale(value.locale);
  if (locale !== undefined) context.locale = locale;

  return context;
};

/** Determines if an image value is a URL or base64. */
export const toImageSource = (imageValue: string): 'url' | 'base64' => {
  if (imageValue.startsWith('http://') || imageValue.startsWith('https://')) {
    return 'url';
  }
  return 'base64';
};

/** Resolves the base URL from the incoming request. */
export const resolveRequestBaseUrl = (req: {
  protocol?: string;
  get?: (name: string) => string | undefined;
}): string | null => {
  const host = req.get?.('host')?.trim();
  if (!host) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
  const protocol = req.protocol || 'http';
  return `${protocol}://${host}`;
};

/** Content type mapping by file extension. */
export const contentTypeByExtension: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Extracts the authenticated user from the request. */
export const getRequestUser = (req: Request): { id?: number } | undefined => {
  return (req as Request & { user?: { id?: number } }).user;
};

/** Builds a signed read URL for a chat message image (S3 or local). */
export const buildImageReadUrl = (params: {
  baseUrl: string | null;
  messageId: string;
  imageRef: string;
}): { url: string; expiresAt: string } | null => {
  if (isS3ImageRef(params.imageRef)) {
    const s3 = env.storage.s3;
    if (!s3?.endpoint || !s3.region || !s3.bucket || !s3.accessKeyId || !s3.secretAccessKey) {
      return null;
    }

    return buildS3SignedReadUrlFromRef({
      imageRef: params.imageRef,
      config: {
        endpoint: s3.endpoint,
        region: s3.region,
        bucket: s3.bucket,
        accessKeyId: s3.accessKeyId,
        secretAccessKey: s3.secretAccessKey,
        signedUrlTtlSeconds: env.storage.signedUrlTtlSeconds,
        publicBaseUrl: s3.publicBaseUrl,
        sessionToken: s3.sessionToken,
      },
    });
  }

  if (!params.baseUrl) {
    return null;
  }

  return buildSignedChatImageReadUrl({
    baseUrl: params.baseUrl,
    messageId: params.messageId,
  });
};
