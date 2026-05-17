// SEC: prompt-injection / field validation. Single source of truth —
// replaces duplicates in langchain.orchestrator.ts and visit-context.ts.

/**
 * Sanitizes string for safe LLM prompt inclusion. NFC normalize, strip
 * zero-width + control chars, trim, truncate to `maxLength` (default 200).
 */
export const sanitizePromptInput = (value: string, maxLength = 200): string => {
  return (
    value
      .normalize('NFC')
      .replace(/[\u200B-\u200D\uFEFF\u2060\u00AD]/g, '')
      // eslint-disable-next-line no-control-regex -- input sanitization strips control characters
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      .trim()
      .slice(0, maxLength)
  );
};

/** Letters, combining marks, spaces, hyphens, apostrophes. */
const NAME_PATTERN = /^[\p{L}\p{M}\s'-]+$/u;

/**
 * Trim, max-length check, reject chars outside NAME_PATTERN.
 *
 * @throws if exceeds maxLength or contains disallowed chars.
 */
export const validateNameField = (
  value: string | undefined,
  fieldName: string,
  maxLength = 100,
): string | undefined => {
  if (value == null) {
    return undefined;
  }

  // Stryker equivalent: typed `string | undefined`, early-return on null
  // eliminates undefined → `else` (String(value)) unreachable for typed callers.
  // Stryker disable next-line ConditionalExpression,StringLiteral
  const str = typeof value === 'string' ? value : String(value);
  const trimmed = str.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  if (trimmed.length > maxLength) {
    throw new Error(`${fieldName} must be at most ${String(maxLength)} characters`);
  }

  if (!NAME_PATTERN.test(trimmed)) {
    throw new Error(`${fieldName} contains invalid characters`);
  }

  return trimmed;
};
