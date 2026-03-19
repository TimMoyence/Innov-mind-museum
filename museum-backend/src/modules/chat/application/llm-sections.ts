import { ChatMessage } from '../domain/chatMessage.entity';
import { sanitizePromptInput } from '@shared/validation/input';

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
  guideLevel: 'beginner' | 'intermediate' | 'expert';
  timeoutSummaryMs: number;
  /** Pre-built visit context block to inject into the prompt. */
  visitContextBlock?: string;
  hasImage?: boolean;
}

const isFrenchLocale = (locale?: string): boolean => {
  return !!locale && locale.toLowerCase().startsWith('fr');
};

const buildGuideLevelHint = (
  guideLevel: 'beginner' | 'intermediate' | 'expert',
  french: boolean,
): string => {
  if (guideLevel === 'expert') {
    return french
      ? 'Utilise un vocabulaire d histoire de l art avance et des details contextuels precis.'
      : 'Use advanced art-history vocabulary and precise contextual details.';
  }

  if (guideLevel === 'intermediate') {
    return french
      ? 'Utilise un niveau intermediaire, avec des termes techniques courts et expliques.'
      : 'Use an intermediate level with short explained technical terms.';
  }

  return french
    ? 'Utilise un langage simple, clair et pedagogique.'
    : 'Use simple, clear, beginner-friendly language.';
};

const buildSummaryPrompt = (
  locale: string | undefined,
  museumMode: boolean,
  guideLevel: 'beginner' | 'intermediate' | 'expert',
  visitContextBlock?: string,
  hasImage?: boolean,
): string => {
  const french = isFrenchLocale(locale);
  const modeLine = museumMode
    ? french
      ? 'Le visiteur est en mode visite guidee: ajoute une etape suivante concrete.'
      : 'Visitor is in guided museum mode: include one concrete next-step recommendation.'
    : french
      ? 'Le visiteur est en mode libre: reste concis et utile.'
      : 'Visitor is in regular mode: stay concise and practical.';

  const wordLimit = museumMode ? 150 : 250;

  const parts = [
    '[SECTION:summary]',
    french ? 'Reponds en francais.' : 'Reply in English.',
    buildGuideLevelHint(guideLevel, french),
    modeLine,
  ];

  if (visitContextBlock) {
    parts.push(visitContextBlock);
  }

  parts.push(
    french
      ? `Ecris comme si tu parlais face-a-face. Sois precis: noms, dates, techniques, details visuels. Evite le remplissage comme "C est une oeuvre interessante" — dis ce qui la rend interessante. Limite la reponse a ${wordLimit} mots.`
      : `Write as if speaking face-to-face. Be specific: names, dates, techniques, visual details. Avoid filler like "This is an interesting work" — say what makes it interesting. Keep answer under ${wordLimit} words.`,
  );

  if (hasImage) {
    parts.push(
      french
        ? '[ANALYSE IMAGE] Le visiteur a partage une photographie. Suis cette sequence: 1. Decris ce que tu observes: medium, composition, couleurs, details visibles. 2. Identifie l oeuvre si possible (titre, artiste, periode). Indique ton niveau de confiance. 3. Fournis une interpretation contextuelle. 4. Si tu ne peux pas l identifier, decris ce que tu vois et propose des interpretations possibles. Ne fabrique pas d attributions. Remplis le champ imageDescription avec ta description visuelle.'
        : '[IMAGE ANALYSIS] The visitor shared a photograph. Follow this sequence: 1. Describe what you observe: medium, composition, colors, visible details. 2. Identify the artwork if possible (title, artist, period). State your confidence. 3. Provide contextual interpretation. 4. If you cannot identify it, describe what you see and offer possible interpretations. Do not fabricate attributions. Fill the imageDescription field with your visual description.',
    );
  }

  parts.push(
    'Return strict JSON only with this shape:',
    '{"answer":"string","deeperContext":"string?","openQuestion":"string?","followUpQuestions":["string?"],"imageDescription":"string?","detectedArtwork":{"artworkId":"string?","title":"string?","artist":"string?","confidence":"number?","source":"string?","museum":"string?","room":"string?"},"recommendations":["string"],"expertiseSignal":"beginner|intermediate|expert","citations":["string"]}',
    'Do not add markdown fences.',
    french
      ? 'Dans deeperContext, ajoute 2-3 phrases de contexte technique, historique ou d interpretation (optionnel).'
      : 'In deeperContext, add 2-3 sentences of technical, historical, or interpretive context (optional).',
    french
      ? 'Dans openQuestion, pose une question qui incite le visiteur a regarder l oeuvre de plus pres (optionnel).'
      : 'In openQuestion, ask a question that encourages the visitor to look more closely at the work (optional).',
    french
      ? 'Dans followUpQuestions, suggere 1-2 questions de relance naturelles que le visiteur pourrait poser ensuite, basees sur la discussion. Garde-les courtes et specifiques.'
      : 'In followUpQuestions, suggest 1-2 natural follow-up questions the visitor might want to ask next, based on the current discussion. Keep them short and specific.',
    museumMode
      ? french
        ? 'Dans recommendations, suggere 1-3 oeuvres ou salles proches que le visiteur pourrait explorer ensuite.'
        : 'In recommendations, suggest 1-3 nearby artworks or rooms the visitor could explore next.'
      : french
        ? 'Dans recommendations, suggere 1-2 oeuvres ou sujets lies a explorer.'
        : 'In recommendations, suggest 1-2 related artworks or topics to explore.',
    french
      ? 'Definis expertiseSignal au niveau d expertise du visiteur que tu detectes dans sa question.'
      : 'Set expertiseSignal to the visitor expertise level you detect from their question.',
  );

  return parts.join(' ');
};

/**
 * Creates the ordered list of LLM section definitions to execute for a single request.
 * Currently produces a single required "summary" section.
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
    .map((message) => message.text!.trim());
};

/**
 * Generates a localized fallback summary from conversation history when the LLM call fails.
 * Stitches together recent non-empty messages with location context and a next-step suggestion.
 * @param input - History, question, location, locale, and museum mode.
 * @returns A human-readable fallback text.
 */
export const createSummaryFallback = (input: SummaryFallbackInput): string => {
  const french = isFrenchLocale(input.locale);
  const snippets = lastNonEmptyTexts(input.history, 3);
  const sanitizedLocation = input.location ? sanitizePromptInput(input.location) : undefined;
  const locationLine = sanitizedLocation
    ? french
      ? `Vous etes pres de ${sanitizedLocation}. `
      : `You are currently near ${sanitizedLocation}. `
    : '';
  const recap = snippets.length
    ? snippets.join(' ')
    : input.question?.trim() || (french ? 'Question sur une oeuvre.' : 'Artwork question.');

  if (french) {
    return [
      `${locationLine}Voici un resume rapide: ${recap}`,
      input.museumMode
        ? 'Prochaine etape: comparez les details de composition avec une oeuvre voisine.'
        : 'Piste utile: observez la composition, la lumiere et le contexte historique.',
      'Souhaitez-vous une lecture plus technique, biographique ou symbolique ?',
    ].join(' ');
  }

  return [
    `${locationLine}Quick summary: ${recap}`,
    input.museumMode
      ? 'Next step: compare composition details with a nearby work.'
      : 'Helpful angle: focus on composition, light, and historical context.',
    'Would you like a technical, biographical, or symbolic reading next?',
  ].join(' ');
};
