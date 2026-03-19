import { AppError } from '@shared/errors/app.error';

/** Result of OCR text extraction from an image. */
export interface OcrResult {
  text: string;
  confidence: number;
}

/** Port interface for extracting text from images via OCR. */
export interface OcrService {
  extractText(imageBase64: string): Promise<OcrResult | null>;
}

/** Tesseract.js-based OCR implementation. */
export class TesseractOcrService implements OcrService {
  async extractText(imageBase64: string): Promise<OcrResult | null> {
    try {
      const Tesseract = await import('tesseract.js');
      const worker = await Tesseract.createWorker('eng');
      const buffer = Buffer.from(imageBase64, 'base64');
      const { data } = await worker.recognize(buffer);
      await worker.terminate();

      const text = data.text?.trim();
      if (!text) return null;

      return { text, confidence: data.confidence / 100 };
    } catch (error) {
      throw new AppError({
        message: `OCR extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        statusCode: 500,
        code: 'OCR_EXTRACTION_ERROR',
      });
    }
  }
}

/** No-op OCR service for when OCR guard is disabled. */
export class DisabledOcrService implements OcrService {
  async extractText(): Promise<OcrResult | null> {
    return null;
  }
}
