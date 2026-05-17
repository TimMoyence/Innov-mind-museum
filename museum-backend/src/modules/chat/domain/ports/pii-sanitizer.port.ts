export interface PiiSanitizerResult {
  sanitizedText: string;
  detectedPiiCount: number;
}

export interface PiiSanitizer {
  sanitize(text: string): PiiSanitizerResult;
}

/** Pass-through. */
export class DisabledPiiSanitizer implements PiiSanitizer {
  sanitize(text: string): PiiSanitizerResult {
    return { sanitizedText: text, detectedPiiCount: 0 };
  }
}
