export type ChatRole = 'user' | 'assistant' | 'system';

export interface CreateSessionInput {
  userId?: number;
  locale?: string;
  museumMode?: boolean;
}

export interface PostMessageInput {
  text?: string;
  image?: {
    source: 'base64' | 'url' | 'upload';
    value: string;
    mimeType?: string;
    sizeBytes?: number;
  };
  context?: {
    location?: string;
    museumMode?: boolean;
    guideLevel?: 'beginner' | 'intermediate' | 'expert';
    locale?: string;
  };
}

export interface MessagePageQuery {
  cursor?: string;
  limit?: number;
}

export interface ChatAssistantMetadata {
  detectedArtwork?: {
    artworkId?: string;
    title?: string;
    artist?: string;
    confidence?: number;
    source?: string;
  };
  citations?: string[];
}
