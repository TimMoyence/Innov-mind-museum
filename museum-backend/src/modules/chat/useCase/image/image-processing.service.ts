import { createHash } from 'node:crypto';

import { AppError, badRequest, invalidInput } from '@shared/errors/app.error';
import { errorMessage } from '@shared/errors/error-message';
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

import type { PostMessageInput } from '@modules/chat/domain/chat.types';
import type { ImageProcessorPort } from '@modules/chat/domain/ports/image-processor.port';
import type { ImageStorage } from '@modules/chat/domain/ports/image-storage.port';
import type { OcrService } from '@modules/chat/domain/ports/ocr.port';
import type { evaluateUserInputGuardrail } from '@modules/chat/useCase/guardrail/art-topic-guardrail';

export interface ProcessedImage {
  imageRef: string;
  orchestratorImage: NonNullable<PostMessageInput['image']>;
  imageContentHash?: string;
}

interface ImageProcessingServiceDeps {
  imageStorage: ImageStorage;
  ocr?: OcrService;
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
    options?: { skipStorage?: boolean },
  ): Promise<ProcessedImage> {
    if (image.source === 'url') {
      if (!isSafeImageUrl(image.value)) {
        throw invalidInput('Image URL must be a safe HTTPS URL');
      }
      return { imageRef: image.value, orchestratorImage: image };
    }

    if (image.source === 'upload') {
      const normalizedBase64 = image.value.replace(/\s/g, '');
      const mimeType = image.mimeType;
      const sizeBytes = image.sizeBytes;

      if (!mimeType || typeof mimeType !== 'string') {
        throw invalidInput('Uploaded image mime type is required');
      }
      if (!Number.isFinite(sizeBytes)) {
        throw invalidInput('Uploaded image size is required');
      }

      assertMimeType(mimeType, env.upload.allowedMimeTypes);
      assertMagicBytes(normalizedBase64);

      const stripped = await this.stripExif(normalizedBase64, mimeType);
      assertImageSize(stripped.sizeBytes, env.llm.maxImageBytes);

      const imageRef = options?.skipStorage
        ? ''
        : await this.imageStorage.save({
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
        imageContentHash: hashImageBuffer(stripped.buffer),
      };
    }

    const decoded = decodeBase64Image(image.value);
    assertMimeType(decoded.mimeType, env.upload.allowedMimeTypes);
    assertMagicBytes(decoded.base64);

    const strippedLegacy = await this.stripExif(decoded.base64, decoded.mimeType);
    assertImageSize(strippedLegacy.sizeBytes, env.llm.maxImageBytes);

    const imageRef = options?.skipStorage
      ? ''
      : await this.imageStorage.save({
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
      imageContentHash: hashImageBuffer(strippedLegacy.buffer),
    };
  }

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
        error: errorMessage(error),
        sessionId,
      });
    }
  }
}

function hashImageBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex').slice(0, 32);
}
