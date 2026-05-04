import { buildChatImageObjectKey } from '@modules/chat/useCase/image/chat-image.helpers';
import {
  assertImageSize,
  assertMagicBytes,
  assertMimeType,
  decodeBase64Image,
  isSafeImageUrl,
} from '@modules/chat/useCase/image/image-input';
import { AppError, badRequest } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { env } from '@src/config/env';

import type { PostMessageInput } from '@modules/chat/domain/chat.types';
import type { ImageProcessorPort } from '@modules/chat/domain/ports/image-processor.port';
import type { ImageStorage } from '@modules/chat/domain/ports/image-storage.port';
import type { OcrService } from '@modules/chat/domain/ports/ocr.port';
import type { evaluateUserInputGuardrail } from '@modules/chat/useCase/guardrail/art-topic-guardrail';

/** Result of image processing: the storage reference and the orchestrator-ready payload. */
interface ProcessedImage {
  imageRef: string;
  orchestratorImage: NonNullable<PostMessageInput['image']>;
}

/** Dependencies for the image processing service. */
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

/**
 * Encapsulates the image processing pipeline: URL validation, base64 decoding,
 * MIME/size assertion, storage persistence, and OCR injection guard.
 */
export class ImageProcessingService {
  private readonly imageStorage: ImageStorage;
  private readonly ocr?: OcrService;
  private readonly imageProcessor?: ImageProcessorPort;

  constructor(deps: ImageProcessingServiceDeps) {
    this.imageStorage = deps.imageStorage;
    this.ocr = deps.ocr;
    this.imageProcessor = deps.imageProcessor;
  }

  /**
   * Processes an image input: validates, decodes, stores, and returns the storage reference
   * along with the orchestrator-ready payload.
   *
   * @param image - The raw image input from the user message.
   * @param sessionId - Session identifier for storage key generation.
   * @param ownerId - User identifier for storage key generation.
   * @returns The processed image reference and orchestrator payload.
   * @throws {AppError} 400 on invalid URL, missing MIME type, size exceeded, etc.
   */
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
      };
    }

    // Legacy base64 (data-URL or raw)
    const decoded = decodeBase64Image(image.value);
    assertMimeType(decoded.mimeType, env.upload.allowedMimeTypes);
    assertMagicBytes(decoded.base64);

    const stripped = await this.stripExif(decoded.base64, decoded.mimeType);
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
        source: image.source,
        value: stripped.base64,
        mimeType: stripped.mimeType,
        sizeBytes: stripped.sizeBytes,
      },
    };
  }

  /**
   * Strips EXIF / metadata via the injected processor. When no processor is
   * configured (legacy unit tests), the input is returned untouched — this
   * branch is intentionally observable so wiring regressions surface in CI.
   *
   * @param base64 - Magic-byte-validated base64 payload.
   * @param mimeType - Declared MIME type.
   * @returns Cleaned base64, MIME, and post-strip byte size.
   */
  private async stripExif(
    base64: string,
    mimeType: string,
  ): Promise<{ base64: string; mimeType: string; sizeBytes: number }> {
    if (!this.imageProcessor) {
      const sizeBytes = Buffer.from(base64, 'base64').byteLength;
      return { base64, mimeType, sizeBytes };
    }
    const inputBuffer = Buffer.from(base64, 'base64');
    const cleaned = await this.imageProcessor.stripExif(inputBuffer, mimeType);
    return {
      base64: cleaned.buffer.toString('base64'),
      mimeType: cleaned.mime,
      sizeBytes: cleaned.buffer.byteLength,
    };
  }

  /**
   * Runs OCR on the processed image and validates the extracted text against the input guardrail.
   * Fails open: if OCR extraction itself errors, the request proceeds.
   *
   * @param orchestratorImage - The orchestrator-ready image payload.
   * @param evaluateGuardrail - The guardrail evaluation function to check OCR text.
   * @param sessionId - Session identifier for logging.
   * @throws {AppError} 400 if OCR text contains disallowed content.
   */
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
