/** Result of PII sanitization on user text. */
export interface PiiSanitizerResult {
  sanitizedText: string;
  detectedPiiCount: number;
}

/** Port interface for stripping PII from user text before LLM processing. */
export interface PiiSanitizer {
  sanitize(text: string): PiiSanitizerResult;
}

/** Null-object implementation that passes text through unchanged. */
export class DisabledPiiSanitizer implements PiiSanitizer {
  /** Returns text unchanged with zero PII count. */
  sanitize(text: string): PiiSanitizerResult {
    return { sanitizedText: text, detectedPiiCount: 0 };
  }
}
