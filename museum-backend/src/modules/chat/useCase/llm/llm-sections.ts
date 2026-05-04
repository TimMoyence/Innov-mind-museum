import { buildLocalizedFallback, FALLBACK_TEMPLATES } from '@shared/i18n/fallback-messages';
import { resolveLocale, localeToLanguageName } from '@shared/i18n/locale';
import { sanitizePromptInput } from '@shared/validation/input';

import type {
  ContentPreference,
  ExpertiseLevel,
  LlmSectionName,
} from '@modules/chat/domain/chat.types';
import type { ChatMessage } from '@modules/chat/domain/message/chatMessage.entity';

export type { LlmSectionName } from '@modules/chat/domain/chat.types';

/** Defines a single LLM section with its name, timeout budget, and prompt text. */
interface LlmSectionDefinition {
  name: LlmSectionName;
  timeoutMs: number;
  /** Whether the orchestrator must fail when this section fails. */
  required: boolean;
  prompt: string;
}

/** Input parameters used to build the LLM section plan. */
interface LlmSectionPlanInput {
  locale?: string;
  museumMode: boolean;
  guideLevel: ExpertiseLevel;
  timeoutSummaryMs: number;
  /** Pre-built visit context block to inject into the prompt. */
  visitContextBlock?: string;
  hasImage?: boolean;
  /** When true, increases word limits for richer audio-friendly descriptions. */
  audioDescriptionMode?: boolean;
  /** User's content preference hints: 'history' | 'technique' | 'artist'. */
  contentPreferences?: readonly ContentPreference[];
}

const buildGuideLevelHint = (guideLevel: 'beginner' | 'intermediate' | 'expert'): string => {
  if (guideLevel === 'expert') {
    return 'Use advanced art-history vocabulary and precise contextual details.';
  }

  if (guideLevel === 'intermediate') {
    return 'Use an intermediate level with short explained technical terms.';
  }

  return 'Use simple, clear, beginner-friendly language.';
};

/** Human-readable description of each content preference, used in the prompt hint. */
const PREFERENCE_LABELS: Record<ContentPreference, string> = {
  history: 'historical context and provenance of the work',
  technique: 'visual representation, style, materials, and composition',
  artist: "the artist's biography, influences, and life events",
};

/**
 * Builds a non-forcing hint line from the user's content preferences.
 * Returns an empty string when no preferences are set (respects zero-friction default).
 */
const buildContentPreferencesHint = (
  preferences: readonly ContentPreference[] | undefined,
): string => {
  if (!preferences || preferences.length === 0) return '';
  const labels = preferences.map((p) => PREFERENCE_LABELS[p]).join('; ');
  return `USER CONTENT PREFERENCES: the visitor prefers to learn about — ${labels}. Emphasize these angles when naturally relevant to the current topic, but do not force them if the question is about something else.`;
};

const resolveWordLimit = (museumMode: boolean, audioDescriptionMode?: boolean): number => {
  if (audioDescriptionMode) return museumMode ? 300 : 400;
  return museumMode ? 150 : 250;
};

const buildSummaryPrompt = (input: {
  locale?: string;
  museumMode: boolean;
  guideLevel: 'beginner' | 'intermediate' | 'expert';
  visitContextBlock?: string;
  hasImage?: boolean;
  audioDescriptionMode?: boolean;
  contentPreferences?: readonly ContentPreference[];
}): string => {
  const {
    locale,
    museumMode,
    guideLevel,
    visitContextBlock,
    hasImage,
    audioDescriptionMode,
    contentPreferences,
  } = input;
  const language = localeToLanguageName(resolveLocale([locale]));
  const modeLine = museumMode
    ? 'Visitor is in guided museum mode: include one concrete next-step recommendation.'
    : 'Visitor is in regular mode: stay concise and practical.';

  const wordLimit = resolveWordLimit(museumMode, audioDescriptionMode);

  const parts = [
    '[SECTION:summary]',
    `Reply in ${language}.`,
    buildGuideLevelHint(guideLevel),
    modeLine,
  ];

  const preferencesHint = buildContentPreferencesHint(contentPreferences);
  if (preferencesHint) {
    parts.push(preferencesHint);
  }

  if (visitContextBlock) {
    parts.push(visitContextBlock);
  }

  parts.push(
    `Write as if speaking face-to-face. Be specific: names, dates, techniques, visual details. Avoid filler like "This is an interesting work" — say what makes it interesting. Keep answer under ${String(wordLimit)} words.`,
  );

  if (hasImage) {
    parts.push(
      '[IMAGE ANALYSIS] The visitor shared a photograph. If the <user_message> contains a specific question (e.g. asks who/what/why/which, or about an element visible in the image), ANSWER THAT QUESTION FIRST using the image as visual evidence — do not default to a generic description. Point to the specific visual details that support your answer (location in the frame, iconographic attributes, inscriptions, posture, symbols). Only after answering, add brief relevant context (1–2 sentences). If the user_message is empty or merely "[Image sent]", then describe what you observe, identify the artwork if possible (title, artist, period, confidence), and offer contextual interpretation. Never fabricate attributions. Always fill the imageDescription field with your visual description.',
    );
  }

  parts.push(
    'Write your answer as plain text first.',
    'After your answer, on a new line output exactly [META] followed by a JSON object with this shape:',
    '{"deeperContext":"string?","openQuestion":"string?","followUpQuestions":["string?"],"imageDescription":"string?","suggestedImages":[{"query":"string","description":"string"}],"detectedArtwork":{"artworkId":"string?","title":"string?","artist":"string?","confidence":"number?","source":"string?","museum":"string?","room":"string?"},"recommendations":["string"],"expertiseSignal":"beginner|intermediate|expert","citations":["string"]}',
    'Do not include the answer text in the JSON — it is already provided above.',
    'Do not add markdown fences around the JSON.',
    'In deeperContext, add 2-3 sentences of technical, historical, or interpretive context (optional).',
    'In openQuestion, ask a question that encourages the visitor to look more closely at the work (optional).',
    'In followUpQuestions, suggest 1-2 natural follow-up questions the visitor might want to ask next, based on the current discussion. Keep them short and specific.',
    museumMode
      ? 'In recommendations, suggest 1-3 nearby artworks or rooms the visitor could explore next.'
      : 'In recommendations, suggest 1-2 related artworks or topics to explore.',
    'In suggestedImages, if the topic is visual (a painting, sculpture, place, or person), suggest 1-2 short search queries that would find illustrative photos (e.g. {"query":"Mona Lisa painting Louvre","description":"The painting in its Louvre gallery"}). Omit for non-visual topics.',
    'Set expertiseSignal to the visitor expertise level you detect from their question.',
  );

  return parts.join(' ');
};

/**
 * Creates the ordered list of LLM section definitions to execute for a single request.
 * Currently produces a single required "summary" section.
 *
 * @param input - Configuration for locale, guide level, museum mode, and timeouts.
 * @returns An array of section definitions.
 */
export const createLlmSectionPlan = (input: LlmSectionPlanInput): LlmSectionDefinition[] => {
  const summary: LlmSectionDefinition = {
    name: 'summary',
    timeoutMs: input.timeoutSummaryMs,
    required: true,
    prompt: buildSummaryPrompt({
      locale: input.locale,
      museumMode: input.museumMode,
      guideLevel: input.guideLevel,
      visitContextBlock: input.visitContextBlock,
      hasImage: input.hasImage,
      audioDescriptionMode: input.audioDescriptionMode,
      contentPreferences: input.contentPreferences,
    }),
  };

  return [summary];
};

/** Input for building a best-effort summary fallback when the LLM section fails. */
interface SummaryFallbackInput {
  history: ChatMessage[];
  question?: string;
  location?: string;
  locale?: string;
  museumMode: boolean;
}

const lastNonEmptyTexts = (history: ChatMessage[], limit = 3): string[] => {
  return history
    .filter((message) => !!message.text?.trim())
    .slice(-limit)
    .map((message) => (message.text ?? '').trim());
};

/**
 * Generates a localized fallback summary from conversation history when the LLM call fails.
 * Stitches together recent non-empty messages with location context and a next-step suggestion.
 *
 * @param input - History, question, location, locale, and museum mode.
 * @returns A human-readable fallback text.
 */
export const createSummaryFallback = (input: SummaryFallbackInput): string => {
  const locale = resolveLocale([input.locale]);
  const snippets = lastNonEmptyTexts(input.history, 3);
  const sanitizedLocation = input.location ? sanitizePromptInput(input.location) : undefined;
  const recap = snippets.length
    ? snippets.join(' ')
    : // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
      input.question?.trim() || FALLBACK_TEMPLATES[locale].defaultQuestion;

  return buildLocalizedFallback(locale, {
    location: sanitizedLocation,
    recap,
    museumMode: input.museumMode,
  });
};
