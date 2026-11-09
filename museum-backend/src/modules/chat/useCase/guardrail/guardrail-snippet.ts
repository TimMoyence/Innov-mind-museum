import { createHash } from 'node:crypto';

import { maskPersonalData } from '@shared/pii/mask-personal-data';

export interface GuardrailSnippet {
  snippetPreview: string;
  snippetFingerprint: string;
}

const SNIPPET_PREVIEW_MAX_CHARS = 64;

export function redactSnippetForAudit(fullText: string): GuardrailSnippet {
  const snippetPreview = maskPersonalData(fullText).text.slice(0, SNIPPET_PREVIEW_MAX_CHARS);
  const snippetFingerprint = createHash('sha256').update(fullText, 'utf8').digest('hex');
  return { snippetPreview, snippetFingerprint };
}
