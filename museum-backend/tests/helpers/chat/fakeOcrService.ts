import type { OcrService, OcrResult } from '@modules/chat/adapters/secondary/ocr-service';

/** Fake OCR service for tests. Returns configurable text extraction results. */
export class FakeOcrService implements OcrService {
  private result: OcrResult | null = null;
  private shouldThrow = false;
  callCount = 0;

  /** Configure the OCR result returned on next call. */
  setResult(result: OcrResult | null): void {
    this.result = result;
  }

  /** Configure to throw a non-AppError (simulating OCR library failure). */
  setThrow(shouldThrow: boolean): void {
    this.shouldThrow = shouldThrow;
  }

  async extractText(): Promise<OcrResult | null> {
    this.callCount++;
    if (this.shouldThrow) {
      throw new Error('OCR engine crashed');
    }
    return this.result;
  }
}
