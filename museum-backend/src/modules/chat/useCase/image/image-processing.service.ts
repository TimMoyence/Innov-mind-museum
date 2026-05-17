import { createHash } from 'node:crypto';

import { AppError, badRequest } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import { buildChatImageObjectKey } from './chat-image.helpers';
import {
  assertImageSize,
  assertMagicBytes,
  assertMimeType,
  decodeBase64Image,
  isSafeImageUrl,
} from './image-input';

import type { ImageProcessorPort } from '@modules/chat/adapters/secondary/image/image-processing.service';
import type { PostMessageInput } from '@modules/chat/domain/chat.types';
import type { ImageStorage } from '@modules/chat/domain/ports/image-storage.port';
import type { OcrService } from '@modules/chat/domain/ports/ocr.port';
import type { evaluateUserInputGuardrail } from '@modules/chat/useCase/guardrail/art-topic-guardrail';

export interface ProcessedImage {
  imageRef: string;
  orchestratorImage: NonNullable<PostMessageInput['image']>;
  /**
   * C3 — Visual content signature (SHA-256 of the post-EXIF-strip image
   * buffer, 32-char hex prefix). Present for `upload` and legacy-base64
   * sources ; absent for `url` source (no buffer to hash). Feeds the LLM
   * cache key derivation in {@link ChatMessageService.buildLlmCacheInput}.
   * Honest naming (UFR-013) — this is a content-bytes SHA-256, NOT a
   * SigLIP / CLIP embedding hash.
   *
   * Note on HEIC→JPEG transcode (spec C3 Q6): if `imageProcessor` performs
   * a non-deterministic transcode, this hash will diverge between repeat
   * scans of the same source photo, lowering cache hit-rate. The default
   * EXIF stripper used in V1 is deterministic (sharp `rotate().toBuffer()`),
   * so this falls out cleanly. Verified in `c3-llm-cache.test.ts` R3.
   */
  imageContentHash?: string;
}

interface ImageProcessingServiceDeps {
  imageStorage: ImageStorage;
  ocr?: OcrService;
  /**
   * EXIF / metadata stripper applied between magic-byte validation and the
   * size cap. Required for GDPR Art. 5(1)(c) data minimisation. When omitted,
   * the pipeline still works but EXIF is preserved — only acceptable in unit
   * tests that explicitly exercise upstream code paths.
   */
  imageProcessor?: ImageProcessorPort;
}

export class ImageProcessingService {
  private readonly imageStorage: ImageStorage;
  private readonly ocr?: OcrService;
  private readonly imageProcessor?: ImageProcessorPort;

  constructor(deps: ImageProcessingServiceDeps) {
    this.imageStorage = deps.imageStorage;
    this.ocr = deps.ocr;
    this.imageProcessor = deps.imageProcessor;
  }

  async processImage(
    image: NonNullable<PostMessageInput['image']>,
    sessionId: string,
    ownerId?: number,
  ): Promise<ProcessedImage> {
    if (image.source === 'url') {
      if (!isSafeImageUrl(image.value)) {
        throw badRequest('Image URL must be a safe HTTPS URL');
      }
      return { imageRef: image.value, orchestratorImage: image };
    }

    if (image.source === 'upload') {
      const normalizedBase64 = image.value.replace(/\s/g, '');
      const mimeType = image.mimeType;
      const sizeBytes = image.sizeBytes;

      if (!mimeType || typeof mimeType !== 'string') {
        throw badRequest('Uploaded image mime type is required');
      }
      if (!Number.isFinite(sizeBytes)) {
        throw badRequest('Uploaded image size is required');
      }

      assertMimeType(mimeType, env.upload.allowedMimeTypes);
      assertMagicBytes(normalizedBase64);

      // EXIF strip BEFORE size check — GDPR Art. 5(1)(c) / STRIDE I4. An
      // oversize-pre-strip image that fits post-strip is accepted.
      const stripped = await this.stripExif(normalizedBase64, mimeType);
      assertImageSize(stripped.sizeBytes, env.llm.maxImageBytes);

      const imageRef = await this.imageStorage.save({
        base64: stripped.base64,
        mimeType: stripped.mimeType,
        objectKey: buildChatImageObjectKey({
          mimeType: stripped.mimeType,
          sessionId,
          userId: ownerId,
        }),
      });

      return {
        imageRef,
        orchestratorImage: {
          source: 'upload',
          value: stripped.base64,
          mimeType: stripped.mimeType,
          sizeBytes: stripped.sizeBytes,
        },
        // C3 (R1, R5) — hash the POST-EXIF-strip buffer so two uploads of
        // the same photo with different EXIF still produce the same hash
        // and hit the same cache entry.
        imageContentHash: hashImageBuffer(stripped.buffer),
      };
    }

    // Legacy base64 (data-URL or raw)
    const decoded = decodeBase64Image(image.value);
    assertMimeType(decoded.mimeType, env.upload.allowedMimeTypes);
    assertMagicBytes(decoded.base64);

    const strippedLegacy = await this.stripExif(decoded.base64, decoded.mimeType);
    assertImageSize(strippedLegacy.sizeBytes, env.llm.maxImageBytes);

    const imageRef = await this.imageStorage.save({
      base64: strippedLegacy.base64,
      mimeType: strippedLegacy.mimeType,
      objectKey: buildChatImageObjectKey({
        mimeType: strippedLegacy.mimeType,
        sessionId,
        userId: ownerId,
      }),
    });

    return {
      imageRef,
      orchestratorImage: {
        source: image.source,
        value: strippedLegacy.base64,
        mimeType: strippedLegacy.mimeType,
        sizeBytes: strippedLegacy.sizeBytes,
      },
      // C3 (R1, R5) — same post-strip hash on the legacy-base64 path.
      imageContentHash: hashImageBuffer(strippedLegacy.buffer),
    };
  }

  /**
   * When no processor is configured (legacy unit tests), the input is returned
   * untouched — this branch is intentionally observable so wiring regressions
   * surface in CI.
   */
  private async stripExif(
    base64: string,
    mimeType: string,
  ): Promise<{ base64: string; mimeType: string; sizeBytes: number; buffer: Buffer }> {
    if (!this.imageProcessor) {
      const buffer = Buffer.from(base64, 'base64');
      return { base64, mimeType, sizeBytes: buffer.byteLength, buffer };
    }
    const inputBuffer = Buffer.from(base64, 'base64');
    const cleaned = await this.imageProcessor.stripExif(inputBuffer, mimeType);
    return {
      base64: cleaned.buffer.toString('base64'),
      mimeType: cleaned.mime,
      sizeBytes: cleaned.buffer.byteLength,
      buffer: cleaned.buffer,
    };
  }

  /** Fails open: if OCR extraction itself errors, the request proceeds. */
  async runOcrGuard(
    orchestratorImage: NonNullable<PostMessageInput['image']>,
    evaluateGuardrail: typeof evaluateUserInputGuardrail,
    sessionId: string,
  ): Promise<void> {
    if (!this.ocr) return;

    try {
      const ocrResult = await this.ocr.extractText(orchestratorImage.value);
      if (ocrResult?.text) {
        const ocrGuardrail = evaluateGuardrail({ text: ocrResult.text });
        if (!ocrGuardrail.allow) {
          throw badRequest('Image contains disallowed content');
        }
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.warn('ocr_guard_fail_open', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });
    }
  }
}

/**
 * C3 — Computes a 32-char hex SHA-256 prefix over a (post-EXIF-strip) image
 * buffer. Used as the visual signature for the LLM response cache key
 * derivation. Length aligns with `sha256OfCanonicalInput` in
 * `llm-cache.service.ts` (128 bits — collision probability ≈ 10⁻²⁰ over 10⁹
 * entries). One-way: safe to log the hex prefix (no PII / no raw bytes).
 */
function hashImageBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 32);
}
