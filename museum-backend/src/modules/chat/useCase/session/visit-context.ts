import { sanitizePromptInput } from '@shared/validation/input';

import type {
  ChatAssistantMetadata,
  VisitContext,
  VisitedArtwork,
} from '@modules/chat/domain/chat.types';
import type { ChatSession } from '@modules/chat/domain/session/chatSession.entity';

const emptyContext = (): VisitContext => ({
  museumConfidence: 0,
  artworksDiscussed: [],
  roomsVisited: [],
  detectedExpertise: 'beginner',
  expertiseSignals: 0,
  lastUpdated: new Date().toISOString(),
});

/**
 * Incrementally updates the visit context with artwork, room, museum, and expertise data
 * extracted from the assistant's metadata.
 *
 * @param existing - The current visit context (or null/undefined for a fresh context).
 * @param metadata - Assistant response metadata containing detected artwork and expertise.
 * @param messageId - Id of the assistant message that produced this metadata.
 * @returns A new VisitContext reflecting the accumulated visit state.
 */
export const updateVisitContext = (
  existing: VisitContext | null | undefined,
  metadata: ChatAssistantMetadata,
  messageId: string,
): VisitContext => {
  const ctx: VisitContext = existing
    ? {
        ...existing,
        artworksDiscussed: [...existing.artworksDiscussed],
        roomsVisited: [...existing.roomsVisited],
      }
    : emptyContext();

  const artwork = metadata.detectedArtwork;
  if (artwork?.title) {
    const entry: VisitedArtwork = {
      title: artwork.title,
      artist: artwork.artist,
      room: artwork.room,
      messageId,
      discussedAt: new Date().toISOString(),
    };
    ctx.artworksDiscussed.push(entry);

    if (artwork.room && !ctx.roomsVisited.includes(artwork.room)) {
      ctx.roomsVisited.push(artwork.room);
    }

    if (artwork.museum) {
      if (ctx.museumName?.toLowerCase() === artwork.museum.toLowerCase()) {
        ctx.museumConfidence = Math.min(1, ctx.museumConfidence + 0.3);
      } else {
        // Different museum detected — reset confidence AND clear stale description
        // (description was seeded from the original museumId and no longer applies).
        ctx.museumName = artwork.museum;
        ctx.museumConfidence = 0.3;
        ctx.museumDescription = undefined;
      }
    }
  }

  if (metadata.expertiseSignal) {
    ctx.expertiseSignals += 1;
    if (ctx.expertiseSignals >= 3) {
      ctx.detectedExpertise = metadata.expertiseSignal;
    }
  }

  ctx.lastUpdated = new Date().toISOString();
  return ctx;
};

/**
 * Derives a human-readable session title from the first detected artwork or confident museum name.
 * Returns null if the session already has a title or no suitable title can be derived.
 *
 * @param session - The current chat session.
 * @param metadata - Assistant response metadata.
 * @param visitContext - The accumulated visit context.
 * @returns A title string (max 256 chars), or null.
 */
export const deriveSessionTitle = (
  session: ChatSession,
  metadata: ChatAssistantMetadata,
  visitContext: VisitContext,
): string | null => {
  if (session.title) {
    return null;
  }

  // In museum mode: prioritize museum name as title
  if (session.museumMode && visitContext.museumName && visitContext.museumConfidence >= 0.5) {
    return visitContext.museumName.slice(0, 256);
  }

  // Standard mode (or museum mode without confident museum name): prioritize artwork title
  const artwork = metadata.detectedArtwork;
  if (artwork?.title) {
    const parts = [artwork.title];
    if (artwork.artist) parts.push(`— ${artwork.artist}`);
    return parts.join(' ').slice(0, 256);
  }

  // Fallback: museum name even in standard mode
  if (visitContext.museumName && visitContext.museumConfidence >= 0.5) {
    return visitContext.museumName.slice(0, 256);
  }

  return null;
};

/** Max characters of museum description injected into the prompt (prevents prompt bloat). */
const MAX_MUSEUM_DESCRIPTION_CHARS = 600;

/**
 * Absolute cap on the whole visit context block (raised from 800 to accommodate description).
 * Budget: ~600 description + ~200 museum/address/expertise + ~500 artworks/rooms + ~300 nearby = ~1600.
 */
const MAX_VISIT_CONTEXT_BLOCK_CHARS = 1600;

/**
 * Builds a sanitized `[VISIT CONTEXT]` prompt block summarizing the museum, artworks discussed,
 * rooms visited, and detected expertise level. Returns an empty string when there is no context.
 *
 * @param ctx - The accumulated visit context.
 * @returns A prompt-safe text block (max 1600 chars), or empty string.
 */
export const buildVisitContextPromptBlock = (ctx: VisitContext | null | undefined): string => {
  if (!ctx || (!ctx.museumName && ctx.artworksDiscussed.length === 0)) {
    return '';
  }

  const lines: string[] = ['[VISIT CONTEXT]'];

  if (ctx.museumName) {
    lines.push(`Museum: ${sanitizePromptInput(ctx.museumName)}`);
  }

  if (ctx.museumAddress) {
    lines.push(`Address: ${sanitizePromptInput(ctx.museumAddress)}`);
  }

  if (ctx.museumDescription) {
    // Pass maxLength explicitly — sanitizePromptInput defaults to 200 chars which would
    // truncate the description before it reaches the LLM, defeating the 2-4 sentence intro.
    const truncated = sanitizePromptInput(ctx.museumDescription, MAX_MUSEUM_DESCRIPTION_CHARS);
    if (truncated) {
      lines.push(`Museum description: ${truncated}`);
    }
  }

  for (const artwork of ctx.artworksDiscussed.slice(-5)) {
    const parts = [sanitizePromptInput(artwork.title)];
    if (artwork.artist) parts.push(`by ${sanitizePromptInput(artwork.artist)}`);
    if (artwork.room) parts.push(`(${sanitizePromptInput(artwork.room)})`);
    lines.push(`- ${parts.join(' ')}`);
  }

  if (ctx.roomsVisited.length) {
    lines.push(
      `Rooms visited: ${ctx.roomsVisited
        .slice(-5)
        .map((r) => sanitizePromptInput(r))
        .join(', ')}`,
    );
  }

  if (ctx.nearbyMuseums && ctx.nearbyMuseums.length > 0) {
    lines.push('Nearby museums:');
    for (const nm of ctx.nearbyMuseums) {
      const distKm = (nm.distance / 1000).toFixed(1);
      lines.push(`- ${sanitizePromptInput(nm.name)} (${distKm}km)`);
    }
  }

  lines.push(`Expertise: ${ctx.detectedExpertise}`);

  return lines.join('\n').slice(0, MAX_VISIT_CONTEXT_BLOCK_CHARS);
};

/** Fields to patch on the session entity after an assistant response. */
export interface SessionUpdates {
  title?: string;
  museumName?: string;
  visitContext?: VisitContext;
}

/**
 * Computes all session-level updates (visit context, title, museum name) to apply
 * after an assistant response.
 *
 * @param session - The current chat session.
 * @param metadata - Assistant response metadata.
 * @param messageId - Id of the assistant message (may be "pending" before persistence).
 * @returns The session fields to update.
 */
export const computeSessionUpdates = (
  session: ChatSession,
  metadata: ChatAssistantMetadata,
  messageId: string,
): SessionUpdates => {
  const visitContext = updateVisitContext(session.visitContext, metadata, messageId);
  const title = deriveSessionTitle(session, metadata, visitContext);

  const updates: SessionUpdates = { visitContext };

  if (title) {
    updates.title = title;
  }

  if (visitContext.museumName && visitContext.museumConfidence >= 0.5) {
    updates.museumName = visitContext.museumName;
  }

  return updates;
};
