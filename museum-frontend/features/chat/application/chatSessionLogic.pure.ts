export interface ChatUiEnrichedImage {
  url: string;
  thumbnailUrl: string;
  caption: string;
  rationale?: string | null;
  source: 'wikidata' | 'unsplash' | 'commons' | 'musaium';
  score: number;
  attribution?: string | null;
}

import type { components } from '@/shared/api/generated/openapi';

import { formatCarnetDate } from '../domain/carnet';

export type CitationSourceType = 'wikidata' | 'web' | 'museum-catalog' | 'commons';

export interface CitationSource {
  url: string;
  type: CitationSourceType;
  title: string;
  quote: string;
  confidence?: number;
}

export interface ChatUiMessageMetadata {
  detectedArtwork?: {
    artworkId?: string;
    title?: string;
    artist?: string;
    museum?: string;
    room?: string;
    confidence?: number;
  };
  recommendations?: string[];
  expertiseSignal?: 'beginner' | 'intermediate' | 'expert';
  deeperContext?: string;
  openQuestion?: string;
  imageDescription?: string;
  images?: ChatUiEnrichedImage[];
  compareResults?: components['schemas']['CompareResult'];
  sources?: CitationSource[];
}

export interface ChatUiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  createdAt: string;
  imageRef?: string | null;
  image?: {
    url: string;
    expiresAt: string;
  } | null;
  metadata?: ChatUiMessageMetadata | null;
  transcription?: { text: string } | null;
  sendFailed?: boolean;
  cached?: boolean;
  suggestions?: string[];
}

export const findLastAssistantMessage = (
  messages: readonly ChatUiMessage[],
): ChatUiMessage | null => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const candidate = messages[i];
    if (candidate?.role === 'assistant') return candidate;
  }
  return null;
};

export const sortByTime = (messages: ChatUiMessage[]): ChatUiMessage[] => {
  return [...messages].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
};

export interface ApiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text?: string | null;
  createdAt: string;
  imageRef?: string | null;
  image?: { url: string; expiresAt: string } | null;
  metadata?: Record<string, unknown> | null;
}

export const mapApiMessageToUiMessage = (apiMsg: ApiMessage): ChatUiMessage => ({
  id: apiMsg.id,
  role: apiMsg.role,
  text: apiMsg.text ?? '',
  createdAt: apiMsg.createdAt,
  imageRef: apiMsg.imageRef,
  image: apiMsg.image ?? null,
  metadata: (apiMsg.metadata ?? null) as ChatUiMessageMetadata | null,
});

export interface VisitSummary {
  museumName: string | null;
  artworks: { title: string; artist?: string; room?: string; imageUrl?: string }[];
  roomsVisited: string[];
  duration: { startedAt: string; endedAt: string; minutes: number };
  messageCount: number;
  expertiseLevel: string | null;
}

export const buildVisitSummary = (
  messages: ChatUiMessage[],
  sessionTitle: string | null,
): VisitSummary => {
  const sorted = sortByTime(messages);
  const seenTitles = new Set<string>();
  const artworks: VisitSummary['artworks'] = [];
  const roomSet = new Set<string>();
  let lastExpertise: string | null = null;
  let museumName: string | null = null;

  for (const msg of sorted) {
    if (msg.role !== 'assistant' || !msg.metadata) continue;

    const { detectedArtwork, expertiseSignal, images } = msg.metadata;

    if (detectedArtwork?.title && !seenTitles.has(detectedArtwork.title)) {
      seenTitles.add(detectedArtwork.title);
      artworks.push({
        title: detectedArtwork.title,
        artist: detectedArtwork.artist,
        room: detectedArtwork.room,
        imageUrl: images?.[0]?.thumbnailUrl ?? images?.[0]?.url,
      });
    }

    if (detectedArtwork?.room) roomSet.add(detectedArtwork.room);
    if (detectedArtwork?.museum && !museumName) museumName = detectedArtwork.museum;
    if (expertiseSignal) lastExpertise = expertiseSignal;
  }

  const startedAt = sorted[0]?.createdAt ?? new Date().toISOString();
  const endedAt = sorted[sorted.length - 1]?.createdAt ?? startedAt;
  const minutes = Math.max(
    0,
    Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000),
  );

  return {
    museumName: museumName ?? sessionTitle,
    artworks,
    roomsVisited: [...roomSet],
    duration: { startedAt, endedAt, minutes },
    messageCount: sorted.length,
    expertiseLevel: lastExpertise,
  };
};

export interface VisitCarnetDetail {
  summary: VisitSummary;
  transcript: ChatUiMessage[];
  dateLabel: string | null;
  durationLabel: string;
}

export interface VisitCarnetSessionInput {
  id: string;
  locale?: string | null;
  museumMode?: boolean;
  museumName?: string | null;
  title?: string | null;
  createdAt: string;
  updatedAt: string;
  intent?: 'default' | 'walk' | null;
}

export const buildVisitCarnetDetail = (
  session: VisitCarnetSessionInput,
  messages: ChatUiMessage[],
  locale: string,
): VisitCarnetDetail => {
  const summary = buildVisitSummary(messages, session.title ?? null);
  const transcript = sortByTime(messages);

  const dateLabel = formatCarnetDate(session.updatedAt, locale);

  const durationLabel = String(summary.duration.minutes);

  return { summary, transcript, dateLabel, durationLabel };
};

export interface BuildOptimisticMessageParams {
  text?: string;
  imageUri?: string;
  hasAudio?: boolean;
  id?: string;
  imageFallbackLabel?: string;
  audioFallbackLabel?: string;
}

export const buildOptimisticMessage = (params: BuildOptimisticMessageParams): ChatUiMessage => {
  const trimmed = params.text?.trim() ?? '';
  const fallback = params.hasAudio
    ? (params.audioFallbackLabel ?? 'Voice message')
    : params.imageUri
      ? (params.imageFallbackLabel ?? 'Image sent')
      : '';
  return {
    id: params.id ?? `${String(Date.now())}-user`,
    role: 'user',
    text: trimmed || fallback,
    createdAt: new Date().toISOString(),
    image: params.imageUri ? { url: params.imageUri, expiresAt: '' } : null,
  };
};

export const isRenderableAssistantContent = (
  text: string | null | undefined,
  metadata?: ChatUiMessageMetadata | null,
): boolean => {
  if ((text ?? '').trim() !== '') return true;
  if ((metadata?.images?.length ?? 0) > 0) return true;
  if (metadata?.compareResults) return true;
  if ((metadata?.imageDescription ?? '').trim() !== '') return true;
  return false;
};

export const bumpSuccessfulSend = (ref: { current: number }, threshold = 3): boolean => {
  ref.current += 1;
  return ref.current === threshold;
};

export const formatLocation = (
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): string | undefined => {
  if (latitude == null || longitude == null) return undefined;
  return `lat:${String(latitude)},lng:${String(longitude)}`;
};

export type MarkdownLinkAction = 'in-app' | 'system' | 'ignore';

const SYSTEM_SCHEMES = new Set(['mailto:', 'tel:', 'sms:']);

export function decideMarkdownLinkAction(url: string | undefined | null): MarkdownLinkAction {
  if (!url) return 'ignore';
  let protocol: string;
  try {
    protocol = new URL(url).protocol.toLowerCase();
  } catch {
    return 'ignore';
  }
  if (protocol === 'https:') return 'in-app';
  if (SYSTEM_SCHEMES.has(protocol)) return 'system';
  return 'ignore';
}
