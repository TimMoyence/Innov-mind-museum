import {
  CitationSourceSchema,
  type ChatAssistantMetadata,
  type CitationSource,
  type ExpertiseLevel,
  type SuggestedImage,
} from '@modules/chat/domain/chat.types';

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

/**
 * Citations v2 (C4) — parses `sources[]` via `CitationSourceSchema.safeParse`
 * (R2 + NFR8).
 *
 * Behaviour:
 * - Non-array (e.g. malformed LLM output `"not-an-array"`) → `undefined`
 *   (graceful, no throw).
 * - Per-entry validation via Zod `safeParse`; malformed entries are SILENTLY
 *   dropped, valid ones retained.
 * - Empty result after filtering (every entry invalid OR empty input array)
 *   → `undefined` (do NOT surface empty arrays; FE convention is "absent =
 *   no sources to render").
 *
 * Backward-compat (NFR8): legacy `citations: string[]` is still parsed by
 * `toCitations` above; both fields may coexist in the same metadata for
 * one release cycle.
 */
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

/**
 * Maximum length (in characters) of a suggested follow-up question.
 *
 * Strings strictly longer than this are DROPPED (returned as `undefined`) —
 * NOT silently sliced — so prompt drift surfaces early at the boundary
 * rather than producing visually-truncated questions for the visitor.
 * Mirrors `mainAssistantOutputSchema.suggestedFollowUp.max(80)` (B3 R5).
 */
const MAX_SUGGESTED_FOLLOWUP_CHARS = 80;

/**
 * B3 — Parse the singular `suggestedFollowUp` field emitted by the LLM.
 *
 * Returns the trimmed string when `typeof value === 'string'` AND
 * `0 < trimmed.length ≤ 80`, `undefined` otherwise. Strict-drop on oversize
 * (no silent slice) — see {@link MAX_SUGGESTED_FOLLOWUP_CHARS}.
 *
 * Singularity invariant : an array input is rejected outright (returns
 * `undefined`), even if the LLM drifts from the structured-output schema.
 * The B3 doctrine "JAMAIS 3 boutons — référence un fact précis ou rien" is
 * enforced at 4 layers ; this is the runtime defence on the parser boundary.
 */
export const toSuggestedFollowUp = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > MAX_SUGGESTED_FOLLOWUP_CHARS) return undefined;
  return trimmed;
};

/**
 * Sentinel placeholder for missing/empty `rationale` and `caption` strings on
 * a SuggestedImage entry. Carried through the metadata so the FE can swap it
 * for the localised i18n fallback (`chat.enrichment.rationale_fallback`).
 *
 * The empty-string sentinel is intentional: matches the same convention used
 * for `EnrichedImage.rationale` set by adapters that pre-date the LLM-authored
 * field (Unsplash, raw Wikidata P18). Truthiness check on FE → fallback.
 */
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
      // R7 — if the LLM omits rationale or caption, fall back gracefully:
      // - caption defaults to description (already validated non-empty above)
      // - rationale defaults to RATIONALE_FALLBACK_MARKER (resolved by FE i18n)
      return {
        query,
        description,
        rationale: rationaleRaw || RATIONALE_FALLBACK_MARKER,
        caption: captionRaw || description,
      };
    })
    .filter((item): item is SuggestedImage => item !== null)
    // R15 — defence-in-depth cap to 4 entries (LLM prompt also instructs ≤4).
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
  metadata.suggestedFollowUp = toSuggestedFollowUp(parsed.suggestedFollowUp);
  metadata.imageDescription = toOptionalString(parsed.imageDescription);
  metadata.suggestedImages = toSuggestedImages(parsed.suggestedImages);

  return metadata;
};

/** Delimiter separating the answer text from the JSON metadata section. */
const META_DELIMITER = '\n[META]';

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
