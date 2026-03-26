import { buildLocalizedFallback, FALLBACK_TEMPLATES } from '@shared/i18n/fallback-messages';
import { resolveLocale, localeToLanguageName } from '@shared/i18n/locale';
import { sanitizePromptInput } from '@shared/validation/input';

import type { ExpertiseLevel } from '../domain/chat.types';
import type { ChatMessage } from '../domain/chatMessage.entity';

/** Identifier for a named LLM prompt section. */
export type LlmSectionName = 'summary';

/** Defines a single LLM section with its name, timeout budget, and prompt text. */
export interface LlmSectionDefinition {
  name: LlmSectionName;
  timeoutMs: number;
  /** Whether the orchestrator must fail when this section fails. */
  required: boolean;
  prompt: string;
}

/** Input parameters used to build the LLM section plan. */
export interface LlmSectionPlanInput {
  locale?: string;
  museumMode: boolean;
  guideLevel: ExpertiseLevel;
  timeoutSummaryMs: number;
  /** Pre-built visit context block to inject into the prompt. */
  visitContextBlock?: string;
  hasImage?: boolean;
}

const buildGuideLevelHint = (
  guideLevel: 'beginner' | 'intermediate' | 'expert',
): string => {
  if (guideLevel === 'expert') {
    return 'Use advanced art-history vocabulary and precise contextual details.';
  }

  if (guideLevel === 'intermediate') {
    return 'Use an intermediate level with short explained technical terms.';
  }

  return 'Use simple, clear, beginner-friendly language.';
};

const buildSummaryPrompt = (
  locale: string | undefined,
  museumMode: boolean,
  guideLevel: 'beginner' | 'intermediate' | 'expert',
  visitContextBlock?: string,
  hasImage?: boolean,
): string => {
  const language = localeToLanguageName(resolveLocale([locale]));
  const modeLine = museumMode
    ? 'Visitor is in guided museum mode: include one concrete next-step recommendation.'
    : 'Visitor is in regular mode: stay concise and practical.';

  const wordLimit = museumMode ? 150 : 250;

  const parts = [
    '[SECTION:summary]',
    `Reply in ${language}.`,
    buildGuideLevelHint(guideLevel),
    modeLine,
  ];

  if (visitContextBlock) {
    parts.push(visitContextBlock);
  }

  parts.push(
    `Write as if speaking face-to-face. Be specific: names, dates, techniques, visual details. Avoid filler like "This is an interesting work" — say what makes it interesting. Keep answer under ${wordLimit} words.`,
  );

  if (hasImage) {
    parts.push(
      '[IMAGE ANALYSIS] The visitor shared a photograph. Follow this sequence: 1. Describe what you observe: medium, composition, colors, visible details. 2. Identify the artwork if possible (title, artist, period). State your confidence. 3. Provide contextual interpretation. 4. If you cannot identify it, describe what you see and offer possible interpretations. Do not fabricate attributions. Fill the imageDescription field with your visual description.',
    );
  }

  parts.push(
    'Write your answer as plain text first.',
    'After your answer, on a new line output exactly [META] followed by a JSON object with this shape:',
    '{"deeperContext":"string?","openQuestion":"string?","followUpQuestions":["string?"],"imageDescription":"string?","detectedArtwork":{"artworkId":"string?","title":"string?","artist":"string?","confidence":"number?","source":"string?","museum":"string?","room":"string?"},"recommendations":["string"],"expertiseSignal":"beginner|intermediate|expert","citations":["string"]}',
    'Do not include the answer text in the JSON — it is already provided above.',
    'Do not add markdown fences around the JSON.',
    'In deeperContext, add 2-3 sentences of technical, historical, or interpretive context (optional).',
    'In openQuestion, ask a question that encourages the visitor to look more closely at the work (optional).',
    'In followUpQuestions, suggest 1-2 natural follow-up questions the visitor might want to ask next, based on the current discussion. Keep them short and specific.',
    museumMode
      ? 'In recommendations, suggest 1-3 nearby artworks or rooms the visitor could explore next.'
      : 'In recommendations, suggest 1-2 related artworks or topics to explore.',
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
export const createLlmSectionPlan = (
  input: LlmSectionPlanInput,
): LlmSectionDefinition[] => {
  const summary: LlmSectionDefinition = {
    name: 'summary',
    timeoutMs: input.timeoutSummaryMs,
    required: true,
    prompt: buildSummaryPrompt(
      input.locale,
      input.museumMode,
      input.guideLevel,
      input.visitContextBlock,
      input.hasImage,
    ),
  };

  return [summary];
};

/** Input for building a best-effort summary fallback when the LLM section fails. */
export interface SummaryFallbackInput {
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
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string fallback
    : input.question?.trim() || FALLBACK_TEMPLATES[locale].defaultQuestion;

  return buildLocalizedFallback(locale, {
    location: sanitizedLocation,
    recap,
    museumMode: input.museumMode,
  });
};
