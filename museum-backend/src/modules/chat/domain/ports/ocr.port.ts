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
