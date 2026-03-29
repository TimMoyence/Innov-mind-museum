import multer from 'multer';

import { badRequest } from '@shared/errors/app.error';
import { env } from '@src/config/env';

import { buildSignedChatImageReadUrl } from './chat.image-url';
import { buildS3SignedReadUrlFromRef, isS3ImageRef } from '../../secondary/image-storage.s3';

import type { Request } from 'express';

/** Parsed visitor context extracted from request body. */
export interface ParsedContext {
  location?: string;
  museumMode?: boolean;
  guideLevel?: 'beginner' | 'intermediate' | 'expert';
  locale?: string;
}

/** Multer instance for image uploads (single file, size-limited). */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.llm.maxImageBytes,
    files: 1,
  },
});

/** Multer instance for audio uploads (single file, size-limited). */
export const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.llm.maxAudioBytes,
    files: 1,
  },
});

/** Parses and validates the optional context object from the request body. */
export const parseContext = (
  input: unknown,
  // eslint-disable-next-line sonarjs/cognitive-complexity, complexity -- context parsing requires sequential field validation
): ParsedContext | undefined => {
  if (input === undefined || input === null || input === '') {
    return undefined;
  }

  let raw = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      throw badRequest('context must be valid JSON when provided as string');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, sonarjs/different-types-comparison -- defensive: JSON.parse("null") returns null at runtime
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw badRequest('context must be an object');
  }

  const value = raw as Record<string, unknown>;

  const context: ParsedContext = {};
  if (value.location !== undefined) {
    if (typeof value.location !== 'string') {
      throw badRequest('context.location must be a string');
    }
    context.location = value.location;
  }

  if (value.museumMode !== undefined) {
    if (typeof value.museumMode === 'boolean') {
      context.museumMode = value.museumMode;
    } else if (typeof value.museumMode === 'string') {
      if (value.museumMode.toLowerCase() === 'true') {
        context.museumMode = true;
      } else if (value.museumMode.toLowerCase() === 'false') {
        context.museumMode = false;
      } else {
        throw badRequest('context.museumMode must be a boolean');
      }
    } else {
      throw badRequest('context.museumMode must be a boolean');
    }
  }

  if (value.guideLevel !== undefined) {
    if (typeof value.guideLevel !== 'string') {
      throw badRequest('context.guideLevel must be a string');
    }
    if (!['beginner', 'intermediate', 'expert'].includes(value.guideLevel)) {
      throw badRequest('context.guideLevel must be beginner, intermediate, or expert');
    }
    context.guideLevel = value.guideLevel as 'beginner' | 'intermediate' | 'expert';
  }

  if (value.locale !== undefined) {
    if (typeof value.locale !== 'string') {
      throw badRequest('context.locale must be a string');
    }
    context.locale = value.locale;
  }

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
