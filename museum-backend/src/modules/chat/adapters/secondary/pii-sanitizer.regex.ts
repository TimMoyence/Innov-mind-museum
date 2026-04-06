import type { PiiSanitizer, PiiSanitizerResult } from '../../domain/ports/pii-sanitizer.port';

/**
 * Regex-based PII sanitizer that detects and replaces emails and phone numbers.
 *
 * Deliberately does NOT attempt name detection — in a museum context,
 * artist and artwork names would cause too many false positives.
 */
export class RegexPiiSanitizer implements PiiSanitizer {
  // eslint-disable-next-line sonarjs/slow-regex -- character classes do not overlap after @ (local part vs domain), no backtracking risk on bounded input
  private static readonly EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  private static readonly MIN_PHONE_DIGITS = 7;

  /** Replaces detected emails and phone numbers with placeholder tokens. */
  sanitize(text: string): PiiSanitizerResult {
    let detectedPiiCount = 0;
    let result = text;

    // Emails first (more specific pattern, avoids phone regex eating @ symbols)
    result = result.replace(RegexPiiSanitizer.EMAIL_PATTERN, () => {
      detectedPiiCount++;
      return '[EMAIL]';
    });

    // Phone numbers: match sequences of digits separated by delimiters
    result = this.sanitizePhones(result, (count) => {
      detectedPiiCount += count;
    });

    return { sanitizedText: result, detectedPiiCount };
  }

  /**
   * Detects phone numbers by finding digit groups separated by common delimiters.
   * Uses a simple two-pass approach (find candidate, count digits) instead of a
   * complex regex to avoid backtracking risks.
   */
  private sanitizePhones(text: string, onDetected: (count: number) => void): string {
    // Match an optional country code prefix followed by digit groups separated by space/dot/dash
    // eslint-disable-next-line security/detect-unsafe-regex -- bounded repetition on non-overlapping classes; input capped by maxTextLength env guard
    const phonePattern = /(?:\+\d{1,3}[\s.-])?\(?\d{1,4}\)?(?:[\s.-]\d{1,4}){2,5}(?=[\s,;.!?)]|$)/g;
    let count = 0;
    const replaced = text.replace(phonePattern, (match) => {
      const digitCount = match.replace(/\D/g, '').length;
      if (digitCount >= RegexPiiSanitizer.MIN_PHONE_DIGITS) {
        count++;
        return '[PHONE]';
      }
      return match;
    });
    onDetected(count);
    return replaced;
  }
}
