import {
  CitationSourceSchema,
  type ChatAssistantMetadata,
  type CitationSource,
  type ExpertiseLevel,
  type SuggestedImage,
} from '@modules/chat/domain/chat.types';

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const toCitations = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const filtered = value.filter((item): item is string => typeof item === 'string');
  return filtered.length ? filtered : undefined;
};

const toSources = (value: unknown): CitationSource[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const filtered: CitationSource[] = [];
  for (const item of value) {
    const result = CitationSourceSchema.safeParse(item);
    if (result.success) {
      filtered.push(result.data);
    }
  }

  return filtered.length ? filtered : undefined;
};

const toRecommendations = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const filtered = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, 5);
  return filtered.length ? filtered : undefined;
};

const RATIONALE_FALLBACK_MARKER = '';

const toSuggestedImages = (value: unknown): SuggestedImage[] | undefined => {
  if (!Array.isArray(value)) return undefined;

  const normalised = value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item): SuggestedImage | null => {
      const query = typeof item.query === 'string' ? item.query.trim() : '';
      const description = typeof item.description === 'string' ? item.description.trim() : '';
      if (!query || !description) return null;
      const rationaleRaw = typeof item.rationale === 'string' ? item.rationale.trim() : '';
      const captionRaw = typeof item.caption === 'string' ? item.caption.trim() : '';
      return {
        query,
        description,
        rationale: rationaleRaw || RATIONALE_FALLBACK_MARKER,
        caption: captionRaw || description,
      };
    })
    .filter((item): item is SuggestedImage => item !== null)
    .slice(0, 4);

  return normalised.length > 0 ? normalised : undefined;
};

const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
};

const EXPERTISE_LEVELS: ExpertiseLevel[] = ['beginner', 'intermediate', 'expert'];

const toExpertiseSignal = (value: unknown): ExpertiseLevel | undefined => {
  if (typeof value === 'string' && EXPERTISE_LEVELS.includes(value as ExpertiseLevel)) {
    return value as ExpertiseLevel;
  }
  return undefined;
};

export const extractMetadata = (parsed: Record<string, unknown>): ChatAssistantMetadata => {
  const metadata: ChatAssistantMetadata = {};

  if (isObject(parsed.detectedArtwork)) {
    metadata.detectedArtwork = {
      artworkId:
        typeof parsed.detectedArtwork.artworkId === 'string'
          ? parsed.detectedArtwork.artworkId
          : undefined,
      title:
        typeof parsed.detectedArtwork.title === 'string' ? parsed.detectedArtwork.title : undefined,
      artist:
        typeof parsed.detectedArtwork.artist === 'string'
          ? parsed.detectedArtwork.artist
          : undefined,
      confidence:
        typeof parsed.detectedArtwork.confidence === 'number'
          ? parsed.detectedArtwork.confidence
          : undefined,
      source:
        typeof parsed.detectedArtwork.source === 'string'
          ? parsed.detectedArtwork.source
          : undefined,
      museum:
        typeof parsed.detectedArtwork.museum === 'string'
          ? parsed.detectedArtwork.museum
          : undefined,
      room:
        typeof parsed.detectedArtwork.room === 'string' ? parsed.detectedArtwork.room : undefined,
    };
  }

  metadata.recommendations = toRecommendations(parsed.recommendations);
  metadata.expertiseSignal = toExpertiseSignal(parsed.expertiseSignal);
  metadata.citations = toCitations(parsed.citations);
  metadata.sources = toSources(parsed.sources);
  metadata.deeperContext = toOptionalString(parsed.deeperContext);
  metadata.openQuestion = toOptionalString(parsed.openQuestion);
  metadata.imageDescription = toOptionalString(parsed.imageDescription);
  metadata.suggestedImages = toSuggestedImages(parsed.suggestedImages);

  return metadata;
};
