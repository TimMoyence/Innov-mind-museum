/**
 * Input sanitization and validation helpers for prompt injection prevention and field validation.
 * Single source of truth — replaces duplicates in langchain.orchestrator.ts and visit-context.ts.
 *
 * @module shared/validation/input
 */

/**
 * Sanitizes a string for safe inclusion in LLM prompts.
 * Applies Unicode NFC normalization, strips zero-width/control characters, trims, and truncates.
 *
 * @param value - The raw input string.
 * @param maxLength - Maximum allowed length after sanitization (default 200).
 * @returns The sanitized string.
 */
export const sanitizePromptInput = (value: string, maxLength = 200): string => {
  return value
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF\u2060\u00AD]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLength);
};

/** Unicode letter pattern for name fields: letters, combining marks, spaces, hyphens, apostrophes. */
const NAME_PATTERN = /^[\p{L}\p{M}\s'-]+$/u;

/**
 * Validates and sanitizes a user name field (first name, last name).
 * Trims whitespace, enforces a max length, and rejects characters outside the allowed set.
 *
 * @param value - The raw name input (may be undefined).
 * @param fieldName - Human-readable field name for error messages (e.g. "firstname").
 * @param maxLength - Maximum allowed length (default 100).
 * @returns The trimmed name, or undefined if the input was empty/undefined.
 * @throws {Error} If the name exceeds maxLength or contains disallowed characters.
 */
export const validateNameField = (
  value: string | undefined,
  fieldName: string,
  maxLength = 100,
): string | undefined => {
  if (value == null) {
    return undefined;
  }

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
