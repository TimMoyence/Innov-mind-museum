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
 * I-OPS4 — chat-route socket-timeout ceiling reconciliation.
 *
 * Coherence margin (ms) added on top of the worst-case server-side work
 * (`totalBudgetMs + serial guardrail budget`) so the response socket is never
 * force-closed by the request-timeout middleware *before* the LLM deadline path
 * has a chance to emit a graceful answer/timeout. Must stay strictly positive.
 */
const CHAT_ROUTE_TIMEOUT_MARGIN_MS = 2_000;

/**
 * Worst-case serial guardrail budget: LLM-Guard sidecar + LLM judge.
 *
 * NOTE (2026-06-01, hybrid-by-gravity friction): the LLM judge now runs in
 * PARALLEL with the sidecar, not in series, so summing the two timeouts is a
 * deliberate SAFE OVER-ESTIMATION (a ceiling), no longer the literal serial
 * latency. Keep the sum — do NOT lower `judgeTimeoutMs` here to "tighten" the
 * ceiling. A looser-than-reality socket ceiling only ever protects the graceful
 * timeout path; a tighter one risks force-closing the socket mid-answer.
 */
const serialGuardrailBudgetMs = (): number =>
  env.guardrails.timeoutMs + env.guardrails.judgeTimeoutMs;

/**
 * Single source of truth for the chat-route socket ceiling (R2 invariant):
 *
 *   chatRouteSocketCeilingMs = totalBudgetMs + serialGuardrailBudget + margin
 *
 * The global request timeout (`env.requestTimeoutMs`, default 20 000) can fire
 * BEFORE the LLM total budget (`env.llm.totalBudgetMs`, default 25 000) plus the
 * serial guardrail budget (~2 000) is exhausted. `extendTimeoutForUpload` raises
 * the socket ceiling to this value on EVERY chat request (text-only included),
 * never shortening an already-larger ceiling. With defaults: 25 000 + 2 000 +
 * 2 000 = 29 000 ms.
 */
export const chatRouteSocketCeilingMs =
  env.llm.totalBudgetMs + serialGuardrailBudgetMs() + CHAT_ROUTE_TIMEOUT_MARGIN_MS;

/**
 * MUST mount BEFORE multer; uses a finite ceiling, not 0/unlimited.
 *
 * Raises the response socket timeout for BOTH the multipart upload path AND the
 * text-only (`application/json`) chat path so neither is cut before the LLM
 * deadline path completes. The multipart path historically used
 * `totalBudgetMs + 10 000` (image ingest headroom); it is kept as a floor and
 * never shortened below `chatRouteSocketCeilingMs` (R1, NFR §Latency).
 */
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
  /**
   * C9.10 (2026-05-17) — set by the FE STT path. When true, the LLM is
   * constrained to a 60-80w prose-only answer for TTS playback.
   */
  voiceMode?: boolean;
}

/** Matches ImageProcessingService.assertMimeType (LLM vision pipeline). */
const DEFAULT_IMAGE_MIME_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp'];

/** iOS m4a, Android 3gp/webm, generic mp4/mpeg/wav. */
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
 * SEC-M2 pre-flight — reject by declared Content-Type BEFORE buffering to cap
 * memory under upload bursts. Authoritative magic-byte + size validation runs
 * in ImageProcessingService / audio ingestion (defense-in-depth).
 * Allowlist memoised lazily so tests can mock env post-module-load.
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

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.llm.maxImageBytes,
    files: 1,
    // TD-MUL-01 — bound multipart field/part/header counts (defense-in-depth
    // DoS guard, lib-docs/multer/PATTERNS.md §4).
    fields: 10,
    parts: 20,
    headerPairs: 50,
  },
  fileFilter: imageFileFilter,
});

export const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.llm.maxAudioBytes,
    files: 1,
    // TD-MUL-01 — same defense-in-depth bounds as the image upload above.
    fields: 10,
    parts: 20,
    headerPairs: 50,
  },
  fileFilter: audioFileFilter,
});

const MAX_CONTEXT_LENGTH = 2000;

const enforceContextSizeLimit = (input: unknown): void => {
  let len = 0;
  if (typeof input === 'string') len = input.length;
  else if (typeof input === 'object' && input !== null) len = JSON.stringify(input).length;
  if (len > MAX_CONTEXT_LENGTH) {
    throw badRequest('context payload too large');
  }
};

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

const parseLocation = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw badRequest('context.location must be a string');
  return value;
};

/** Accepts boolean or boolean-string ('true'/'false'). */
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
  throw badRequest(`${fieldName} must be a boolean`);
};

const parseGuideLevel = (value: unknown): ParsedContext['guideLevel'] | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw badRequest('context.guideLevel must be a string');
  if (!['beginner', 'intermediate', 'expert'].includes(value)) {
    throw badRequest('context.guideLevel must be beginner, intermediate, or expert');
  }
  return value as 'beginner' | 'intermediate' | 'expert';
};

/** Length + charset cap only; whitelist downstream via resolveLocale. */
const parseLocale = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw badRequest('context.locale must be a string');
  if (value.length > 10) throw badRequest('context.locale is too long');
  if (!/^[A-Za-z0-9_-]*$/.test(value)) {
    throw badRequest('context.locale must match BCP47 charset (alnum, dash, underscore)');
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

  // C9.10 — accept boolean or boolean-string (multipart).
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

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
  const protocol = req.protocol || 'http';
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

/** Returns S3-signed URL if `imageRef` is S3, else local signed URL. */
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
