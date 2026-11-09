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

const BRACKETED_TOKEN = /[[［][^[\]［］]{1,200}[\]］]/g;

const isPromptSectionMarker = (inner: string): boolean => {
  const norm = inner.trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^section\s*:/.test(norm)) return true;
  const head = norm.startsWith('end of ') ? norm.slice('end of '.length) : norm;
  return PROMPT_SECTION_MARKERS.some((marker) => {
    if (!head.startsWith(marker)) return false;
    const after = head.slice(marker.length);
    return after === '' || !/^[a-z0-9]/.test(after);
  });
};

export const sanitizePromptInput = (value: string, maxLength = 200): string => {
  return value
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF\u2060\u00AD]/g, '')
    .replace(/(?![\t\n\r])\p{Cc}/gu, '')
    .replace(BRACKETED_TOKEN, (token) => {
      const inner = token.slice(1, -1);
      return isPromptSectionMarker(inner) ? `(${inner.trim()})` : token;
    })
    .trim()
    .slice(0, maxLength);
};

const NAME_PATTERN = /^[\p{L}\p{M}\s'-]+$/u;

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
