import { ChatMessage } from '../domain/chatMessage.entity';

export type GuardrailBlockReason =
  | 'insult'
  | 'external_request'
  | 'prompt_injection'
  | 'off_topic'
  | 'unsafe_output';

export interface GuardrailDecision {
  allow: boolean;
  reason?: GuardrailBlockReason;
}

interface EvaluateUserInputParams {
  text?: string;
  history: ChatMessage[];
}

interface EvaluateAssistantOutputParams {
  text: string;
  history: ChatMessage[];
}

const normalize = (value: string): string => {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const ART_KEYWORDS = [
  'art',
  'artist',
  'artists',
  'artwork',
  'artworks',
  'painting',
  'paintings',
  'sculpture',
  'sculptures',
  'museum',
  'museums',
  'gallery',
  'galleries',
  'monument',
  'monuments',
  'architecture',
  'heritage',
  'culture',
  'cultural',
  'exhibition',
  'installation',
  'portrait',
  'landscape',
  'canvas',
  'fresco',
  'mural',
  'curator',
  'renaissance',
  'baroque',
  'impressionism',
  'modernism',
  'oeuvre',
  'oeuvres',
  'peinture',
  'tableau',
  'toile',
  'musee',
  'musees',
  'galerie',
  'galeries',
  'patrimoine',
  'artistique',
  'artiste',
  'artistes',
  'fresque',
  'exposition',
  'histoire de l art',
  'cathedrale',
  'palais',
  'chateau',
  'temple',
];

const OFF_TOPIC_KEYWORDS = [
  'bitcoin',
  'crypto',
  'stock',
  'trading',
  'bourse',
  'football',
  'soccer',
  'nba',
  'nfl',
  'politic',
  'election',
  'president',
  'recipe',
  'cooking',
  'medical',
  'diagnosis',
  'symptom',
  'javascript',
  'typescript',
  'python',
  'linux',
  'docker',
  'database',
  'meteo',
  'weather',
  'flight',
  'hotel',
  'porn',
  'sex',
];

const INSULT_KEYWORDS = [
  'idiot',
  'stupid',
  'dumb',
  'moron',
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'connard',
  'con',
  'salope',
  'pute',
  'encule',
  'fdp',
  'nique ta mere',
  'ta gueule',
];

const EXTERNAL_ACTION_PATTERNS = [
  /\b(send|email|call|contact|book|reserve|buy|purchase|order)\b/,
  /\b(download|install|open|execute|wire|transfer|pay)\b/,
  /\b(envoie|appelle|contacte|reserve|achete|commande)\b/,
  /\b(telecharge|installe|virement|paie|paye)\b/,
];

const INJECTION_PATTERNS = [
  'ignore previous',
  'ignore all instructions',
  'ignore les instructions',
  'bypass',
  'jailbreak',
  'system prompt',
  'developer mode',
  'mode developpeur',
  'contourne les regles',
];

const FOLLOW_UP_PATTERNS = [
  /^(et|pourquoi|comment|quand|ou|continue|plus de details)\b/,
  /^(and|why|how|when|where|continue|more details)\b/,
];

const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const containsKeyword = (normalizedText: string, keyword: string): boolean => {
  if (keyword.includes(' ') || keyword.length <= 3) {
    const pattern = new RegExp(`(^|\\b)${escapeRegExp(keyword)}(\\b|$)`);
    return pattern.test(normalizedText);
  }

  return normalizedText.includes(keyword);
};

const includesAny = (normalizedText: string, keywords: string[]): boolean => {
  return keywords.some((keyword) => containsKeyword(normalizedText, keyword));
};

const hasArtSignal = (normalizedText: string): boolean => {
  return includesAny(normalizedText, ART_KEYWORDS);
};

const hasOffTopicSignal = (normalizedText: string): boolean => {
  return includesAny(normalizedText, OFF_TOPIC_KEYWORDS);
};

const hasInsultSignal = (normalizedText: string): boolean => {
  return includesAny(normalizedText, INSULT_KEYWORDS);
};

const hasExternalActionSignal = (normalizedText: string): boolean => {
  return EXTERNAL_ACTION_PATTERNS.some((pattern) => pattern.test(normalizedText));
};

const hasPromptInjectionSignal = (normalizedText: string): boolean => {
  return includesAny(normalizedText, INJECTION_PATTERNS);
};

const looksLikeFollowUp = (normalizedText: string): boolean => {
  if (normalizedText.length > 80) {
    return false;
  }

  return FOLLOW_UP_PATTERNS.some((pattern) => pattern.test(normalizedText));
};

const hasArtContext = (history: ChatMessage[]): boolean => {
  const recent = history.slice(-8);
  return recent.some((message) => {
    const value = normalize(message.text || '');
    return value.length > 0 && hasArtSignal(value);
  });
};

export const evaluateUserInputGuardrail = ({
  text,
  history,
}: EvaluateUserInputParams): GuardrailDecision => {
  const normalizedText = normalize(text || '');
  if (!normalizedText) {
    return { allow: true };
  }

  if (hasInsultSignal(normalizedText)) {
    return { allow: false, reason: 'insult' };
  }

  if (hasPromptInjectionSignal(normalizedText)) {
    return { allow: false, reason: 'prompt_injection' };
  }

  if (hasExternalActionSignal(normalizedText)) {
    return { allow: false, reason: 'external_request' };
  }

  if (hasArtSignal(normalizedText)) {
    return { allow: true };
  }

  if (hasOffTopicSignal(normalizedText)) {
    return { allow: false, reason: 'off_topic' };
  }

  if (looksLikeFollowUp(normalizedText) && hasArtContext(history)) {
    return { allow: true };
  }

  return { allow: false, reason: 'off_topic' };
};

export const evaluateAssistantOutputGuardrail = ({
  text,
  history,
}: EvaluateAssistantOutputParams): GuardrailDecision => {
  const normalizedText = normalize(text || '');
  if (!normalizedText) {
    return { allow: false, reason: 'unsafe_output' };
  }

  if (hasInsultSignal(normalizedText)) {
    return { allow: false, reason: 'unsafe_output' };
  }

  if (hasPromptInjectionSignal(normalizedText)) {
    return { allow: false, reason: 'unsafe_output' };
  }

  if (hasExternalActionSignal(normalizedText)) {
    return { allow: false, reason: 'unsafe_output' };
  }

  if (hasArtSignal(normalizedText)) {
    return { allow: true };
  }

  if (hasOffTopicSignal(normalizedText)) {
    return { allow: false, reason: 'off_topic' };
  }

  if (hasArtContext(history)) {
    return { allow: true };
  }

  return { allow: false, reason: 'off_topic' };
};

const isFrench = (locale?: string): boolean => {
  return Boolean(locale && locale.toLowerCase().startsWith('fr'));
};

export const buildGuardrailRefusal = (
  locale: string | undefined,
  reason?: GuardrailBlockReason,
): string => {
  if (isFrench(locale)) {
    if (reason === 'insult') {
      return 'Je ne traite pas les insultes. Je peux aider uniquement sur l art, les monuments, les musees et le patrimoine.';
    }
    if (reason === 'external_request') {
      return 'Je ne peux pas executer de demande externe. Je reponds uniquement a des questions artistiques.';
    }
    return 'Je reponds uniquement sur l art, les monuments, les musees, l architecture et le patrimoine culturel.';
  }

  if (reason === 'insult') {
    return 'I cannot process insulting language. I can only help with art, monuments, museums, and cultural heritage.';
  }
  if (reason === 'external_request') {
    return 'I cannot execute external actions. I can only answer artistic and cultural questions.';
  }
  return 'I answer only about art, monuments, museums, architecture, and cultural heritage.';
};

export const buildGuardrailCitation = (
  reason?: GuardrailBlockReason,
): string | undefined => {
  if (!reason) {
    return undefined;
  }

  return `policy:${reason}`;
};
