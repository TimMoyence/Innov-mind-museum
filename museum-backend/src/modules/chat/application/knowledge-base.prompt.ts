import { sanitizePromptInput } from '@shared/validation/input';

import type { ArtworkFacts } from '../domain/ports/knowledge-base.port';

const MAX_BLOCK_LENGTH = 400;

/**
 * Builds a sanitized `[KNOWLEDGE BASE]` prompt block from verified artwork facts.
 * Returns an empty string when no facts are available.
 *
 * @param facts - Verified artwork facts from Wikidata, or null if unavailable.
 * @returns A prompt-safe text block (max 400 chars), or empty string.
 */
export function buildKnowledgeBasePromptBlock(facts: ArtworkFacts | null): string {
  if (!facts) return '';

  const lines: string[] = ['[KNOWLEDGE BASE — verified facts from Wikidata]'];

  const add = (label: string, value: string | undefined): void => {
    if (value?.trim()) {
      lines.push(`${label}: ${sanitizePromptInput(value, 100)}`);
    }
  };

  lines.push(`Artwork: "${sanitizePromptInput(facts.title, 100)}" (${facts.qid})`);
  add('Artist', facts.artist);
  add('Date', facts.date);
  add('Technique', facts.technique);
  add('Collection', facts.collection);
  add('Movement', facts.movement);
  add('Genre', facts.genre);

  lines.push('Use these verified facts as ground truth. Do not contradict them.');

  const block = lines.join('\n');
  return block.length > MAX_BLOCK_LENGTH
    ? block.slice(0, MAX_BLOCK_LENGTH - 3) + '...'
    : block;
}
