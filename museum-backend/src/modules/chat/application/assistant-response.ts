import type { ChatAssistantMetadata, ExpertiseLevel } from '../domain/chat.types';

/** Parsed answer text and structured metadata extracted from the LLM's raw JSON output. */
interface ParsedAssistantResponse {
  answer: string;
  metadata: ChatAssistantMetadata;
}

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

const toRecommendations = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const filtered = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, 5);
  return filtered.length ? filtered : undefined;
};

const toFollowUpQuestions = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const filtered = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, 3);
  return filtered.length ? filtered : undefined;
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

/**
 * Parses the raw LLM output string into a structured response.
 * Expects a JSON object with an `answer` field; falls back to using the raw string as the answer
 * when parsing fails or the shape is unexpected.
 * @param raw - Raw LLM output (ideally JSON).
 * @returns The parsed answer text and extracted metadata.
 */
export const parseAssistantResponse = (raw: string): ParsedAssistantResponse => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed) || typeof parsed.answer !== 'string') {
      return {
        answer: raw,
        metadata: {},
      };
    }

    const metadata: ChatAssistantMetadata = {};

    if (isObject(parsed.detectedArtwork)) {
      metadata.detectedArtwork = {
        artworkId:
          typeof parsed.detectedArtwork.artworkId === 'string'
            ? parsed.detectedArtwork.artworkId
            : undefined,
        title:
          typeof parsed.detectedArtwork.title === 'string'
            ? parsed.detectedArtwork.title
            : undefined,
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
          typeof parsed.detectedArtwork.room === 'string'
            ? parsed.detectedArtwork.room
            : undefined,
      };
    }

    metadata.recommendations = toRecommendations(parsed.recommendations);
    metadata.expertiseSignal = toExpertiseSignal(parsed.expertiseSignal);
    metadata.citations = toCitations(parsed.citations);
    metadata.deeperContext = toOptionalString(parsed.deeperContext);
    metadata.openQuestion = toOptionalString(parsed.openQuestion);
    metadata.followUpQuestions = toFollowUpQuestions(parsed.followUpQuestions);
    metadata.imageDescription = toOptionalString(parsed.imageDescription);

    return {
      answer: parsed.answer,
      metadata,
    };
  } catch {
    return {
      answer: raw,
      metadata: {},
    };
  }
};
