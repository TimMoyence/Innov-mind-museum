import type { ChatAssistantMetadata, ExpertiseLevel } from '../domain/chat.types';

/** Parsed answer text and structured metadata extracted from the LLM's raw output. */
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

/** Extracts structured metadata fields from a parsed JSON object. */
export const extractMetadata = (parsed: Record<string, unknown>): ChatAssistantMetadata => {
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

  return metadata;
};

/** Delimiter separating the answer text from the JSON metadata section. */
export const META_DELIMITER = '\n[META]';

/**
 * Parses the raw LLM output string into a structured response.
 * Supports two formats:
 * 1. **Text + [META] JSON** (streaming format): answer text, then `\n[META]` delimiter, then JSON metadata.
 * 2. **Legacy JSON** (pre-streaming): a JSON object with an `answer` field.
 * Falls back to using the raw string as the answer when neither format matches.
 *
 * @param raw - Raw LLM output.
 * @returns The parsed answer text and extracted metadata.
 */
export const parseAssistantResponse = (raw: string): ParsedAssistantResponse => {
  // 1. Try [META] delimiter format (streaming-era)
  const metaIndex = raw.indexOf(META_DELIMITER);
  if (metaIndex !== -1) {
    const answer = raw.slice(0, metaIndex).trim();
    const metaJson = raw.slice(metaIndex + META_DELIMITER.length).trim();
    try {
      const parsed = JSON.parse(metaJson) as unknown;
      if (isObject(parsed)) {
        return { answer, metadata: extractMetadata(parsed) };
      }
    } catch {
      // Malformed meta JSON — return the answer text with empty metadata
    }
    return { answer, metadata: {} };
  }

  // 2. Legacy JSON format fallback
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed) || typeof parsed.answer !== 'string') {
      return {
        answer: raw,
        metadata: {},
      };
    }

    return {
      answer: parsed.answer,
      metadata: extractMetadata(parsed),
    };
  } catch {
    return {
      answer: raw,
      metadata: {},
    };
  }
};
