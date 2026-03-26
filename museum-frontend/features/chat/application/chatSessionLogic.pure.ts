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
}

/** Sorts messages by createdAt ascending (earliest first). */
export const sortByTime = (messages: ChatUiMessage[]): ChatUiMessage[] => {
  return [...messages].sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
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
    image: null,
  };
};
