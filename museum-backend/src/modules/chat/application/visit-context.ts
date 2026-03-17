import type {
  ChatAssistantMetadata,
  VisitContext,
  VisitedArtwork,
} from '../domain/chat.types';
import type { ChatSession } from '../domain/chatSession.entity';

const sanitizePromptInput = (value: string): string => {
  return value
    .normalize('NFC')
    .replace(/[\u200B-\u200D\uFEFF\u2060\u00AD]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, 200);
};

const emptyContext = (): VisitContext => ({
  museumConfidence: 0,
  artworksDiscussed: [],
  roomsVisited: [],
  detectedExpertise: 'beginner',
  expertiseSignals: 0,
  lastUpdated: new Date().toISOString(),
});

export const updateVisitContext = (
  existing: VisitContext | null | undefined,
  metadata: ChatAssistantMetadata,
  messageId: string,
): VisitContext => {
  const ctx: VisitContext = existing
    ? { ...existing, artworksDiscussed: [...existing.artworksDiscussed], roomsVisited: [...existing.roomsVisited] }
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
      if (!ctx.museumName) {
        ctx.museumName = artwork.museum;
        ctx.museumConfidence = 0.3;
      } else if (ctx.museumName.toLowerCase() === artwork.museum.toLowerCase()) {
        ctx.museumConfidence = Math.min(1, ctx.museumConfidence + 0.3);
      } else {
        ctx.museumName = artwork.museum;
        ctx.museumConfidence = 0.3;
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

export const deriveSessionTitle = (
  session: ChatSession,
  metadata: ChatAssistantMetadata,
  visitContext: VisitContext,
): string | null => {
  if (session.title) {
    return null;
  }

  const artwork = metadata.detectedArtwork;
  if (artwork?.title) {
    const parts = [artwork.title];
    if (artwork.artist) parts.push(`— ${artwork.artist}`);
    return parts.join(' ').slice(0, 256);
  }

  if (visitContext.museumName && visitContext.museumConfidence >= 0.5) {
    return visitContext.museumName.slice(0, 256);
  }

  return null;
};

export const buildVisitContextPromptBlock = (ctx: VisitContext | null | undefined): string => {
  if (!ctx || (!ctx.museumName && ctx.artworksDiscussed.length === 0)) {
    return '';
  }

  const lines: string[] = ['[VISIT CONTEXT]'];

  if (ctx.museumName) {
    lines.push(`Museum: ${sanitizePromptInput(ctx.museumName)}`);
  }

  for (const artwork of ctx.artworksDiscussed.slice(-5)) {
    const parts = [sanitizePromptInput(artwork.title)];
    if (artwork.artist) parts.push(`by ${sanitizePromptInput(artwork.artist)}`);
    if (artwork.room) parts.push(`(${sanitizePromptInput(artwork.room)})`);
    lines.push(`- ${parts.join(' ')}`);
  }

  if (ctx.roomsVisited.length) {
    lines.push(
      `Rooms visited: ${ctx.roomsVisited.slice(-5).map(sanitizePromptInput).join(', ')}`,
    );
  }

  lines.push(`Expertise: ${ctx.detectedExpertise}`);

  return lines.join('\n').slice(0, 500);
};

export interface SessionUpdates {
  title?: string;
  museumName?: string;
  visitContext?: VisitContext;
}

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
