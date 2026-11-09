import type { OcrService, OcrResult } from '@modules/chat/adapters/secondary/image/ocr-service';

export class FakeOcrService implements OcrService {
  private result: OcrResult | null = null;
  private shouldThrow = false;
  callCount = 0;

  setResult(result: OcrResult | null): void {
    this.result = result;
  }

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
