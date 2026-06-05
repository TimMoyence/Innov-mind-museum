// SEC: prompt-injection / field validation. Single source of truth --
// replaces duplicates in langchain.orchestrator.ts and visit-context.ts.

/**
 * Structural prompt-section markers the LLM prompt builder emits as section
 * delimiters across the pipeline: SYSTEM INSTRUCTIONS / CURRENT ARTWORK
 * (llm-prompt-builder), VISIT CONTEXT (visit-context), USER MEMORY
 * (user-memory.prompt), IMAGE ANALYSIS + SECTION:<x> (llm-sections), LOCAL
 * KNOWLEDGE (db-lookup.prompt), WEB SEARCH (web-search.prompt), KNOWLEDGE BASE
 * (knowledge-base.prompt). A user-controlled field that forges one of these
 * could break out of its section, so `sanitizePromptInput` defangs them (TD-41).
 *
 * Deliberately NOT listed (and so NOT defanged): the PII placeholders
 * `[EMAIL]`/`[PHONE]` (these are the PII scrubber's own output -- defanging them
 * would corrupt redaction) and the nonce-gated `[BEGIN/END UNTRUSTED EXTERNAL
 * DATA -- nonce=...]` envelope (forging it needs the unguessable per-turn nonce).
 */
const PROMPT_SECTION_MARKERS: readonly string[] = [
  'system instructions',
  'current artwork',
  'visit context',
  'user memory',
  'image analysis',
  'local knowledge',
  'web search',
  'knowledge base',
];

/**
 * One bracketed token, ASCII `[...]` or fullwidth `［...］` (U+FF3B/U+FF3D, which
 * NFC does not fold). Inner content is bounded + bracket-free, so the match is
 * linear (no catastrophic backtracking). Case/marker-matching is done in code.
 */
const BRACKETED_TOKEN = /[[［][^[\]［］]{1,200}[\]］]/g;

/**
 * True when the text between brackets is one of the known LLM section markers --
 * case/whitespace-insensitive, tolerating an optional `END OF` prefix and any
 * in-bracket suffix (e.g. `WEB SEARCH -- current information from the web`).
 */
const isPromptSectionMarker = (inner: string): boolean => {
  const norm = inner.trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^section\s*:/.test(norm)) return true;
  const head = norm.startsWith('end of ') ? norm.slice('end of '.length) : norm;
  return PROMPT_SECTION_MARKERS.some((marker) => {
    if (!head.startsWith(marker)) return false;
    // exact match, or the marker followed by a non-alphanumeric separator
    // (space, em-dash, colon...) -- never a longer word like "memorywipe".
    const after = head.slice(marker.length);
    return after === '' || !/^[a-z0-9]/.test(after);
  });
};

/**
 * Sanitizes string for safe LLM prompt inclusion. NFC normalize, strip
 * zero-width + control chars, defang forged prompt-section markers (TD-41),
 * trim, truncate to `maxLength` (default 200).
 */
export const sanitizePromptInput = (value: string, maxLength = 200): string => {
  return (
    value
      .normalize('NFC')
      .replace(/[\u200B-\u200D\uFEFF\u2060\u00AD]/g, '')
      // eslint-disable-next-line no-control-regex -- input sanitization strips control characters
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // TD-41 -- swap a forged section marker's brackets for parens: this breaks
      // the exact-string delimiter the LLM section isolation relies on without
      // deleting the visitor's apparent text. Zero-width/control already stripped
      // above, so the normalized marker comparison sees clean text.
      .replace(BRACKETED_TOKEN, (token) => {
        const inner = token.slice(1, -1);
        return isPromptSectionMarker(inner) ? `(${inner.trim()})` : token;
      })
      .trim()
      .slice(0, maxLength)
  );
};

/** Letters, combining marks, spaces, hyphens, apostrophes. */
const NAME_PATTERN = /^[\p{L}\p{M}\s'-]+$/u;

/**
 * Trim, max-length check, reject chars outside NAME_PATTERN.
 *
 * @throws {Error} if exceeds maxLength or contains disallowed chars.
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
