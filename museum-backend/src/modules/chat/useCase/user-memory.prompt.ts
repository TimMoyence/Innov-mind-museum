import { sanitizePromptInput } from '@shared/validation/input';

import type { UserMemory } from '../domain/userMemory.entity';

const MAX_PROMPT_BLOCK_LENGTH = 600;

/**
 * Builds a sanitized `[USER MEMORY]` prompt block summarizing cross-session knowledge about the user.
 * Returns an empty string when the memory has no meaningful content (sessionCount === 0).
 *
 * @param memory - The user memory entity.
 * @returns A prompt-safe text block (max 600 chars), or empty string.
 */
export const buildUserMemoryPromptBlock = (memory: UserMemory | null | undefined): string => {
  if (!memory || memory.sessionCount === 0) {
    return '';
  }

  const lines: string[] = ['[USER MEMORY]'];

  lines.push(
    `Returning visitor (${String(memory.sessionCount)} session${memory.sessionCount === 1 ? '' : 's'}). Expertise: ${sanitizePromptInput(memory.preferredExpertise, 16)}.`,
  );

  if (memory.favoritePeriods.length > 0) {
    const periods = memory.favoritePeriods
      .slice(0, 5)
      .map((p) => sanitizePromptInput(p, 50))
      .join(', ');
    lines.push(`Favorite periods: ${periods}.`);
  }

  if (memory.favoriteArtists.length > 0) {
    const artists = memory.favoriteArtists
      .slice(0, 5)
      .map((a) => sanitizePromptInput(a, 50))
      .join(', ');
    lines.push(`Favorite artists: ${artists}.`);
  }

  if (memory.museumsVisited.length > 0) {
    const museums = memory.museumsVisited
      .slice(0, 5)
      .map((m) => sanitizePromptInput(m, 50))
      .join(', ');
    lines.push(`Museums visited: ${museums}.`);
  }

  if (memory.interests.length > 0) {
    const interests = memory.interests
      .slice(0, 5)
      .map((i) => sanitizePromptInput(i, 50))
      .join(', ');
    lines.push(`Interests: ${interests}.`);
  }

  if (memory.totalArtworksDiscussed > 0) {
    lines.push(`Artworks discussed so far: ${String(memory.totalArtworksDiscussed)}.`);
  }

  if (memory.summary) {
    lines.push(sanitizePromptInput(memory.summary, 200));
  }

  return lines.join('\n').slice(0, MAX_PROMPT_BLOCK_LENGTH);
};
