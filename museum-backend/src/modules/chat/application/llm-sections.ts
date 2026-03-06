import { ChatMessage } from '../domain/chatMessage.entity';

export type LlmSectionName = 'summary' | 'expertCompact';

export interface LlmSectionDefinition {
  name: LlmSectionName;
  timeoutMs: number;
  required: boolean;
  prompt: string;
}

export interface LlmSectionPlanInput {
  locale?: string;
  museumMode: boolean;
  guideLevel: 'beginner' | 'intermediate' | 'expert';
  parallelEnabled: boolean;
  timeoutSummaryMs: number;
  timeoutExpertCompactMs: number;
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
): string => {
  const french = isFrenchLocale(locale);
  const modeLine = museumMode
    ? french
      ? 'Le visiteur est en mode visite guidee: ajoute une etape suivante concrete.'
      : 'Visitor is in guided museum mode: include one concrete next-step recommendation.'
    : french
      ? 'Le visiteur est en mode libre: reste concis et utile.'
      : 'Visitor is in regular mode: stay concise and practical.';

  return [
    '[SECTION:summary]',
    french ? 'Reponds en francais.' : 'Reply in English.',
    buildGuideLevelHint(guideLevel, french),
    modeLine,
    'Return strict JSON only with this shape:',
    '{"answer":"string","detectedArtwork":{"artworkId":"string?","title":"string?","artist":"string?","confidence":"number?","source":"string?"},"citations":["string"]}',
    'Do not add markdown. Keep answer concise.',
  ].join(' ');
};

const buildExpertCompactPrompt = (
  locale: string | undefined,
  museumMode: boolean,
  guideLevel: 'beginner' | 'intermediate' | 'expert',
): string => {
  const french = isFrenchLocale(locale);
  const modeLine = museumMode
    ? french
      ? 'Propose des transitions entre salles et un prochain arret pertinent.'
      : 'Suggest transitions between rooms and one relevant next stop.'
    : french
      ? 'Propose des pistes de lecture complementaires.'
      : 'Offer additional interpretation angles.';

  return [
    '[SECTION:expertCompact]',
    french ? 'Reponds en francais.' : 'Reply in English.',
    buildGuideLevelHint(guideLevel, french),
    modeLine,
    french
      ? 'Donne 3 a 4 phrases compactes: technique, contexte, interpretation, question ouverte.'
      : 'Provide 3 to 4 compact sentences: technique, context, interpretation, and one open question.',
    'Return plain text only.',
  ].join(' ');
};

export const createLlmSectionPlan = (
  input: LlmSectionPlanInput,
): LlmSectionDefinition[] => {
  const summary: LlmSectionDefinition = {
    name: 'summary',
    timeoutMs: input.timeoutSummaryMs,
    required: true,
    prompt: buildSummaryPrompt(input.locale, input.museumMode, input.guideLevel),
  };

  if (!input.parallelEnabled) {
    return [summary];
  }

  return [
    summary,
    {
      name: 'expertCompact',
      timeoutMs: input.timeoutExpertCompactMs,
      required: false,
      prompt: buildExpertCompactPrompt(
        input.locale,
        input.museumMode,
        input.guideLevel,
      ),
    },
  ];
};

const normalizeParagraph = (value: string | undefined): string => {
  return (value || '').trim().replace(/\s+/g, ' ');
};

export const mergeSectionTexts = (
  summaryText: string,
  expertCompactText?: string,
): string => {
  const summary = normalizeParagraph(summaryText);
  const expert = normalizeParagraph(expertCompactText);

  if (!summary && !expert) {
    return 'I can help with artworks, artist context, and guided museum visits.';
  }

  if (!expert) {
    return summary;
  }

  if (!summary) {
    return expert;
  }

  if (summary.includes(expert) || expert.includes(summary)) {
    return summary.length >= expert.length ? summary : expert;
  }

  return `${summary}\n\n${expert}`;
};

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

export const createSummaryFallback = (input: SummaryFallbackInput): string => {
  const french = isFrenchLocale(input.locale);
  const snippets = lastNonEmptyTexts(input.history, 3);
  const locationLine = input.location
    ? french
      ? `Vous etes pres de ${input.location}. `
      : `You are currently near ${input.location}. `
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

export interface ExpertCompactFallbackInput {
  summaryText: string;
  locale?: string;
  location?: string;
}

export const createExpertCompactFallback = (
  input: ExpertCompactFallbackInput,
): string => {
  const french = isFrenchLocale(input.locale);
  const locationLine = input.location
    ? french
      ? `Pour la suite a ${input.location}, `
      : `For your next stop near ${input.location}, `
    : '';

  if (french) {
    return [
      `${locationLine}examinez la technique (matiere, geste, couleur),`,
      'replacez l oeuvre dans son contexte historique,',
      'puis comparez-la a une piece du meme artiste ou mouvement.',
      'Question guidee: quel detail change le plus votre interpretation ?',
    ].join(' ');
  }

  return [
    `${locationLine}look at technique (material, gesture, color),`,
    'place the work in its historical context,',
    'then compare it with another piece from the same artist or movement.',
    'Guided question: which detail most changes your interpretation?',
  ].join(' ');
};
