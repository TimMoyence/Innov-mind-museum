import { AppError } from '@shared/errors/app.error';
import { errorMessage } from '@shared/errors/error-message';
import { logger } from '@shared/logger/logger';
import { startSpan } from '@shared/observability/sentry';
import { env } from '@src/config/env';

import type { OcrResult, OcrService } from '@modules/chat/domain/ports/ocr.port';
import type { Scheduler } from 'tesseract.js';

export type { OcrResult, OcrService } from '@modules/chat/domain/ports/ocr.port';

export class TesseractOcrService implements OcrService {
  private schedulerPromise: Promise<Scheduler> | null = null;

  private getScheduler(): Promise<Scheduler> {
    this.schedulerPromise ??= (async () => {
      const Tesseract = await import('tesseract.js');
      const scheduler = Tesseract.createScheduler();
      const w1 = await Tesseract.createWorker('eng');
      const w2 = await Tesseract.createWorker('eng');
      scheduler.addWorker(w1);
      scheduler.addWorker(w2);
      return scheduler;
    })();
    return this.schedulerPromise;
  }

  async extractText(imageBase64: string): Promise<OcrResult | null> {
    return await startSpan({ name: 'ocr.extract', op: 'ai.ocr' }, async () => {
      try {
        const scheduler = await this.getScheduler();
        const buffer = Buffer.from(imageBase64, 'base64');
        const timeoutMs = env.llm.timeoutMs;

        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const { data } = await Promise.race([
          scheduler.addJob('recognize', buffer),
          new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error('OCR timed out'));
            }, timeoutMs);
          }),
        ]).finally(() => {
          if (timeoutId !== undefined) clearTimeout(timeoutId);
        });

        const text = (data.text as string | undefined)?.trim();
        if (!text) return null;

        return { text, confidence: data.confidence / 100 };
      } catch (error) {
        if (error instanceof Error && error.message === 'OCR timed out') {
          logger.warn('ocr_timeout', { timeoutMs: env.llm.timeoutMs });
          return null;
        }
        throw new AppError({
          message: `OCR extraction failed: ${errorMessage(error)}`,
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
      } catch {}
      this.schedulerPromise = null;
    }
  }
}

export class DisabledOcrService implements OcrService {
  extractText(): Promise<OcrResult | null> {
    return Promise.resolve(null);
  }
}
