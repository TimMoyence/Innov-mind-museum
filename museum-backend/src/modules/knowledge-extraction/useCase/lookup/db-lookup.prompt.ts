import { sanitizePromptInput } from '@shared/validation/input';

import type { ArtworkKnowledge } from '@modules/knowledge-extraction/domain/artwork-knowledge/artwork-knowledge.entity';
import type { MuseumEnrichment } from '@modules/knowledge-extraction/domain/museum-enrichment/museum-enrichment.entity';

const MAX_BLOCK_LENGTH = 1500;

/** Formats a single artwork into prompt lines. */
function formatArtwork(art: ArtworkKnowledge): string[] {
  const lines: string[] = [`\nArtwork: "${sanitizePromptInput(art.title, 200)}"`];
  const fields: [string | null | undefined, string, number][] = [
    [art.artist, 'Artist', 100],
    [art.period, 'Period', 100],
    [art.technique, 'Technique', 100],
    [art.dimensions, 'Dimensions', 50],
    [art.currentLocation, 'Location', 150],
  ];
  for (const [value, label, max] of fields) {
    if (value) lines.push(`  ${label}: ${sanitizePromptInput(value, max)}`);
  }
  lines.push(`  ${sanitizePromptInput(art.description, 400)}`);
  if (art.historicalContext) {
    lines.push(`  Context: ${sanitizePromptInput(art.historicalContext, 300)}`);
  }
  return lines;
}

/** Formats a single museum into prompt lines. */
function formatMuseum(museum: MuseumEnrichment): string[] {
  const lines: string[] = [`\nMuseum: "${sanitizePromptInput(museum.name, 200)}"`];
  if (museum.website) lines.push(`  Website: ${museum.website}`);
  const jsonFields: [Record<string, unknown> | null | undefined, string][] = [
    [museum.openingHours, 'Hours'],
    [museum.admissionFees, 'Fees'],
    [museum.collections, 'Collections'],
  ];
  for (const [value, label] of jsonFields) {
    if (value) lines.push(`  ${label}: ${JSON.stringify(value)}`);
  }
  return lines;
}

/**
 * Builds a `[LOCAL KNOWLEDGE]` prompt block from DB-stored artwork and museum data.
 * Returns empty string if no data available.
 */
export function buildLocalKnowledgeBlock(
  artworks: ArtworkKnowledge[],
  museums: MuseumEnrichment[],
): string {
  if (artworks.length === 0 && museums.length === 0) return '';

  const lines: string[] = ['[LOCAL KNOWLEDGE — verified data from our database]'];

  for (const art of artworks.slice(0, 3)) {
    lines.push(...formatArtwork(art));
  }
  for (const museum of museums.slice(0, 2)) {
    lines.push(...formatMuseum(museum));
  }

  lines.push('\nPrioritize this verified data over web search results. Cite as established facts.');

  const block = lines.join('\n');
  return block.length > MAX_BLOCK_LENGTH ? block.slice(0, MAX_BLOCK_LENGTH - 3) + '...' : block;
}
