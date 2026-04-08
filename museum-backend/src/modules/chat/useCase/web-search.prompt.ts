import { sanitizePromptInput } from '@shared/validation/input';

import type { SearchResult } from '../domain/ports/web-search.port';

const MAX_BLOCK_LENGTH = 1200;
const MAX_RESULTS_IN_BLOCK = 5;

/**
 * Builds a sanitized `[WEB SEARCH]` prompt block from search results.
 * Returns an empty string when no results are available.
 *
 * The block instructs the LLM to use the results as current information
 * and to cite the source URLs in markdown link format.
 *
 * @param results - Search results from a web search provider, or null/empty if unavailable.
 * @returns A prompt-safe text block (max 1200 chars), or empty string.
 */
export function buildWebSearchPromptBlock(results: SearchResult[] | null): string {
  if (!results || results.length === 0) return '';

  const lines: string[] = ['[WEB SEARCH — current information from the web]'];

  const limited = results.slice(0, MAX_RESULTS_IN_BLOCK);
  for (let i = 0; i < limited.length; i++) {
    const result = limited[i];
    const host = safeHost(result.url);
    const idx = String(i + 1);
    lines.push(`${idx}. "${sanitizePromptInput(result.title, 100)}" — ${host}`);
    lines.push(`   ${sanitizePromptInput(result.snippet, 200)}`);
    lines.push(`   Source: ${result.url}`);
  }

  lines.push(
    'Use these results to ground your answer with current facts. Cite sources as markdown links [text](url).',
  );

  const block = lines.join('\n');
  return block.length > MAX_BLOCK_LENGTH ? block.slice(0, MAX_BLOCK_LENGTH - 3) + '...' : block;
}

/** Returns the URL hostname or 'web' if parsing fails. */
function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'web';
  }
}
