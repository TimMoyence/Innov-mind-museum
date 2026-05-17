export interface OcrResult {
  text: string;
  confidence: number;
}

export interface OcrService {
  extractText(imageBase64: string): Promise<OcrResult | null>;
  destroy?(): Promise<void>;
}
