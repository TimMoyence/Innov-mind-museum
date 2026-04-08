/** A single enriched image attached to an assistant message (e.g. from Wikidata or Unsplash). */
export interface ChatUiEnrichedImage {
  url: string;
  thumbnailUrl: string;
  caption: string;
  source: 'wikidata' | 'unsplash';
  score: number;
  attribution?: string | null;
}

/** Metadata attached to an assistant message, including artwork detection and follow-up suggestions. */
export interface ChatUiMessageMetadata {
  detectedArtwork?: {
    title?: string;
    artist?: string;
    museum?: string;
    room?: string;
    confidence?: number;
  };
  recommendations?: string[];
  followUpQuestions?: string[];
  expertiseSignal?: 'beginner' | 'intermediate' | 'expert';
  deeperContext?: string;
  openQuestion?: string;
  imageDescription?: string;
  images?: ChatUiEnrichedImage[];
}

/** UI-layer representation of a single chat message (user, assistant, or system). */
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
  /** When true the message failed to send and can be retried. */
  sendFailed?: boolean;
  /** When true the response was served from local cache (low-data mode). */
  cached?: boolean;
}

/** Sorts messages by createdAt ascending (earliest first). */
export const sortByTime = (messages: ChatUiMessage[]): ChatUiMessage[] => {
  return [...messages].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
};

/** API message shape as returned by the backend. */
export interface ApiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text?: string;
  createdAt: string;
  imageRef?: string | null;
  image?: { url: string; expiresAt: string } | null;
  metadata?: Record<string, unknown> | null;
}

/** Maps a backend API message to the UI message format. */
export const mapApiMessageToUiMessage = (apiMsg: ApiMessage): ChatUiMessage => ({
  id: apiMsg.id,
  role: apiMsg.role,
  text: apiMsg.text ?? '',
  createdAt: apiMsg.createdAt,
  imageRef: apiMsg.imageRef,
  image: apiMsg.image ?? null,
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime API data
  metadata: (apiMsg.metadata as ChatUiMessageMetadata) ?? null,
});

/** Aggregated summary of a museum visit session, built from chat messages. */
export interface VisitSummary {
  museumName: string | null;
  artworks: { title: string; artist?: string; room?: string; imageUrl?: string }[];
  roomsVisited: string[];
  duration: { startedAt: string; endedAt: string; minutes: number };
  messageCount: number;
  expertiseLevel: string | null;
}

/** Builds a visit summary by aggregating metadata from assistant messages. */
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

/**
 * Builds an optimistic user message for immediate display before the server responds.
 * @param text - User-provided text (may be empty for image-only messages).
 * @param imageUri - Optional image URI.
 * @returns A ChatUiMessage with a temporary id.
 */
export const buildOptimisticMessage = (
  text: string | undefined,
  imageUri: string | undefined,
): ChatUiMessage => {
  const trimmed = text?.trim() ?? '';
  return {
    id: `${String(Date.now())}-user`,
    role: 'user',
    text: trimmed || (imageUri ? '[Image sent]' : ''),
    createdAt: new Date().toISOString(),
    image: imageUri ? { url: imageUri, expiresAt: '' } : null,
  };
};

/**
 * Decides what to do when the user taps a markdown link inside a chat bubble.
 *
 * Returns an action object describing whether to handle the link in-app
 * (`'in-app'`), let the system handler take it (`'system'`), or ignore it
 * (`'ignore'`). Pure function — no React state, no side effects — so it can
 * be unit-tested in isolation.
 *
 * IMPORTANT: this is wired into `@ronradtke/react-native-markdown-display`,
 * whose `onLinkPress` contract is:
 *   - return `true`  → library calls `Linking.openURL(url)` (system browser)
 *   - return `false` → library does NOT open the URL (we handled it ourselves)
 *
 * The contract is the OPPOSITE of what the prop name suggests, which is why
 * this helper exists: callers pick the action by name, not by boolean.
 */
export type MarkdownLinkAction = 'in-app' | 'system' | 'ignore';

export function decideMarkdownLinkAction(url: string | undefined | null): MarkdownLinkAction {
  if (!url) return 'ignore';
  if (url.startsWith('http://') || url.startsWith('https://')) return 'in-app';
  return 'system';
}
