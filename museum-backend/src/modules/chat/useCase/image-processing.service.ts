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

import type { evaluateUserInputGuardrail } from './art-topic-guardrail';
import type { PostMessageInput } from '../domain/chat.types';
import type { ImageStorage } from '../domain/ports/image-storage.port';
import type { OcrService } from '../domain/ports/ocr.port';

/** Result of image processing: the storage reference and the orchestrator-ready payload. */
interface ProcessedImage {
  imageRef: string;
  orchestratorImage: NonNullable<PostMessageInput['image']>;
}

/** Dependencies for the image processing service. */
interface ImageProcessingServiceDeps {
  imageStorage: ImageStorage;
  ocr?: OcrService;
}

/**
 * Encapsulates the image processing pipeline: URL validation, base64 decoding,
 * MIME/size assertion, storage persistence, and OCR injection guard.
 */
export class ImageProcessingService {
  private readonly imageStorage: ImageStorage;
  private readonly ocr?: OcrService;

  constructor(deps: ImageProcessingServiceDeps) {
    this.imageStorage = deps.imageStorage;
    this.ocr = deps.ocr;
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
      assertImageSize(sizeBytes ?? 0, env.llm.maxImageBytes);
      assertMagicBytes(normalizedBase64);

      const imageRef = await this.imageStorage.save({
        base64: normalizedBase64,
        mimeType,
        objectKey: buildChatImageObjectKey({ mimeType, sessionId, userId: ownerId }),
      });

      return {
        imageRef,
        orchestratorImage: { source: 'upload', value: normalizedBase64, mimeType, sizeBytes },
      };
    }

    // Legacy base64 (data-URL or raw)
    const decoded = decodeBase64Image(image.value);
    assertMimeType(decoded.mimeType, env.upload.allowedMimeTypes);
    assertImageSize(decoded.sizeBytes, env.llm.maxImageBytes);
    assertMagicBytes(decoded.base64);

    const imageRef = await this.imageStorage.save({
      base64: decoded.base64,
      mimeType: decoded.mimeType,
      objectKey: buildChatImageObjectKey({
        mimeType: decoded.mimeType,
        sessionId,
        userId: ownerId,
      }),
    });

    return {
      imageRef,
      orchestratorImage: {
        source: image.source,
        value: decoded.base64,
        mimeType: decoded.mimeType,
        sizeBytes: decoded.sizeBytes,
      },
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
