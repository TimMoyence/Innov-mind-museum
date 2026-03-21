import { env } from '@src/config/env';
import { AppError } from '@shared/errors/app.error';
import { logger } from '@shared/logger/logger';
import { startSpan } from '@shared/observability/sentry';

/** Result of OCR text extraction from an image. */
export interface OcrResult {
  text: string;
  confidence: number;
}

/** Port interface for extracting text from images via OCR. */
export interface OcrService {
  extractText(imageBase64: string): Promise<OcrResult | null>;
  destroy?(): Promise<void>;
}

/** Tesseract.js-based OCR implementation with pooled Scheduler (2 workers). */
export class TesseractOcrService implements OcrService {
  private schedulerPromise: Promise<any> | null = null;

  private getScheduler(): Promise<any> {
    if (!this.schedulerPromise) {
      this.schedulerPromise = (async () => {
        const Tesseract = await import('tesseract.js');
        const scheduler = Tesseract.createScheduler();
        const w1 = await Tesseract.createWorker('eng');
        const w2 = await Tesseract.createWorker('eng');
        scheduler.addWorker(w1);
        scheduler.addWorker(w2);
        return scheduler;
      })();
    }
    return this.schedulerPromise;
  }

  async extractText(imageBase64: string): Promise<OcrResult | null> {
    return startSpan({ name: 'ocr.extract', op: 'ai.ocr' }, async () => {
      try {
        const scheduler = await this.getScheduler();
        const buffer = Buffer.from(imageBase64, 'base64');
        const timeoutMs = env.llm?.timeoutMs ?? 30_000;

        const { data } = await Promise.race([
          scheduler.addJob('recognize', buffer),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('OCR timed out')), timeoutMs),
          ),
        ]);

        const text = data.text?.trim();
        if (!text) return null;

        return { text, confidence: data.confidence / 100 };
      } catch (error) {
        if (error instanceof Error && error.message === 'OCR timed out') {
          logger.warn('ocr_timeout', { timeoutMs: env.llm?.timeoutMs ?? 30_000 });
          return null; // fail-open: skip OCR guard on timeout
        }
        throw new AppError({
          message: `OCR extraction failed: ${error instanceof Error ? error.message : String(error)}`,
          statusCode: 500,
          code: 'OCR_EXTRACTION_ERROR',
        });
      }
    });
  }

  async destroy(): Promise<void> {
    if (this.schedulerPromise) {
      try {
        const scheduler = await this.schedulerPromise;
        await scheduler.terminate();
      } catch {
        // Ignore termination errors during shutdown
      }
      this.schedulerPromise = null;
    }
  }
}

/** No-op OCR service for when OCR guard is disabled. */
export class DisabledOcrService implements OcrService {
  async extractText(): Promise<OcrResult | null> {
    return null;
  }
}
