import multer from 'multer';

import { buildSignedChatImageReadUrl } from '@modules/chat/adapters/primary/http/chat.image-url';
import {
  buildS3SignedReadUrlFromRef,
  isS3ImageRef,
} from '@modules/chat/adapters/secondary/storage/image-storage.s3';
import { invalidInput } from '@shared/errors/app.error';
import { nonEmpty } from '@shared/utils/defaults';
import { env } from '@src/config/env';

import type { Request, RequestHandler } from 'express';

const CHAT_ROUTE_TIMEOUT_MARGIN_MS = 2_000;

const serialGuardrailBudgetMs = (): number => env.guardrails.judgeTimeoutMs;

export const chatRouteSocketCeilingMs =
  env.llm.totalBudgetMs + serialGuardrailBudgetMs() + CHAT_ROUTE_TIMEOUT_MARGIN_MS;

export const extendTimeoutForUpload: RequestHandler = (req, res, next) => {
  const ceiling = req.is('multipart/form-data')
    ? Math.max(env.llm.totalBudgetMs + 10_000, chatRouteSocketCeilingMs)
    : chatRouteSocketCeilingMs;
  res.setTimeout(ceiling);
  next();
};

interface ParsedContext {
  location?: string;
  museumMode?: boolean;
  guideLevel?: 'beginner' | 'intermediate' | 'expert';
  locale?: string;
  voiceMode?: boolean;
}

const DEFAULT_IMAGE_MIME_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

const DEFAULT_AUDIO_MIME_TYPES: readonly string[] = [
  'audio/mp4',
  'audio/mpeg',
  'audio/webm',
  'audio/wav',
  'audio/x-m4a',
];

const toMimeSet = (configured: readonly string[], defaults: readonly string[]): Set<string> =>
  new Set((configured.length > 0 ? configured : defaults).map((type) => type.toLowerCase()));

const singleFileUpload = (
  kind: 'image' | 'audio',
  maxBytes: number,
  configuredTypes: () => readonly string[],
  defaultTypes: readonly string[],
): multer.Multer => {
  let allowed: Set<string> | null = null;
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 10, parts: 20, headerPairs: 50 },
    fileFilter: (_req, file, cb) => {
      allowed ??= toMimeSet(configuredTypes(), defaultTypes);
      if (allowed.has((file.mimetype || '').toLowerCase())) {
        cb(null, true);
        return;
      }
      cb(invalidInput(`Unsupported ${kind} content type: ${file.mimetype || 'unknown'}`));
    },
  });
};

export const upload = singleFileUpload(
  'image',
  env.llm.maxImageBytes,
  () => env.upload.allowedMimeTypes,
  DEFAULT_IMAGE_MIME_TYPES,
);

export const audioUpload = singleFileUpload(
  'audio',
  env.llm.maxAudioBytes,
  () => env.upload.allowedAudioMimeTypes,
  DEFAULT_AUDIO_MIME_TYPES,
);

const MAX_CONTEXT_LENGTH = 2000;

const enforceContextSizeLimit = (input: unknown): void => {
  let len = 0;
  if (typeof input === 'string') len = input.length;
  else if (typeof input === 'object' && input !== null) len = JSON.stringify(input).length;
  if (len > MAX_CONTEXT_LENGTH) {
    throw invalidInput('context payload too large');
  }
};

const parseRawContextObject = (input: unknown): Record<string, unknown> => {
  let raw = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      throw invalidInput('context must be valid JSON when provided as string');
    }
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw invalidInput('context must be an object');
  }

  return raw as Record<string, unknown>;
};

const parseLocation = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw invalidInput('context.location must be a string');
  return value;
};

const parseMuseumMode = (value: unknown): boolean | undefined => {
  return parseBoolean(value, 'context.museumMode');
};

const parseBoolean = (value: unknown, fieldName: string): boolean | undefined => {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }
  throw invalidInput(`${fieldName} must be a boolean`);
};

const parseGuideLevel = (value: unknown): ParsedContext['guideLevel'] | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw invalidInput('context.guideLevel must be a string');
  if (!['beginner', 'intermediate', 'expert'].includes(value)) {
    throw invalidInput('context.guideLevel must be beginner, intermediate, or expert');
  }
  return value as 'beginner' | 'intermediate' | 'expert';
};

const parseLocale = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw invalidInput('context.locale must be a string');
  if (value.length > 10) throw invalidInput('context.locale is too long');
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    throw invalidInput('context.locale must match BCP47 charset (alnum, dash, underscore)');
  }
  return value;
};

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

  const voiceMode = parseBoolean(value.voiceMode, 'context.voiceMode');
  if (voiceMode !== undefined) context.voiceMode = voiceMode;

  return context;
};

export const toImageSource = (imageValue: string): 'url' | 'base64' => {
  if (imageValue.startsWith('http://') || imageValue.startsWith('https://')) {
    return 'url';
  }
  return 'base64';
};

export const resolveRequestBaseUrl = (req: {
  protocol?: string;
  get?: (name: string) => string | undefined;
}): string | null => {
  const host = req.get?.('host')?.trim();
  if (!host) {
    return null;
  }

  const protocol = nonEmpty(req.protocol) ?? 'http';
  return `${protocol}://${host}`;
};

export const contentTypeByExtension: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export const getRequestUser = (req: Request): { id?: number } | undefined => {
  return req.user;
};

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
