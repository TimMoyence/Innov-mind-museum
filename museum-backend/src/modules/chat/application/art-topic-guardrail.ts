import { ChatMessage } from '../domain/chatMessage.entity';

/** Reason why the guardrail blocked or flagged a message. */
export type GuardrailBlockReason =
  | 'insult'
  | 'external_request'
  | 'prompt_injection'
  | 'off_topic'
  | 'unsafe_output';

/**
 * Result of a guardrail evaluation.
 * When `allow` is false the message is blocked; `redirectHint` asks the LLM to soft-redirect.
 */
export interface GuardrailDecision {
  allow: boolean;
  reason?: GuardrailBlockReason;
  /** Prompt hint injected into the LLM call to steer the response back on topic. */
  redirectHint?: string;
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
  'ignore above',
  'ignore the above',
  'disregard previous',
  'disregard all',
  'disregard instructions',
  'ignore les instructions',
  'ignore tout ce qui precede',
  'oublie les instructions',
  'bypass',
  'jailbreak',
  'system prompt',
  'reveal your prompt',
  'show your instructions',
  'print your system',
  'repeat your instructions',
  'developer mode',
  'mode developpeur',
  'contourne les regles',
  'override instructions',
  'new instructions',
  'act as if',
  'pretend you are',
  'you are now',
  'from now on',
  'roleplay as',
  'do anything now',
  'dan mode',
];

const GREETING_PATTERN = /^(hi|hello|hey|bonjour|salut|coucou|bonsoir|good morning|good evening|good afternoon)\b/;

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

const hasGreetingSignal = (normalizedText: string): boolean => {
  return GREETING_PATTERN.test(normalizedText);
};

const isShortInnocuousMessage = (normalizedText: string): boolean => {
  return normalizedText.length > 0 && normalizedText.length < 15;
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

const REDIRECT_HINT_OFF_TOPIC =
  'The visitor asked something outside your scope. Acknowledge briefly with warmth, then gently redirect to art and museum topics. Suggest 1-2 art-related follow-up questions in your followUpQuestions field.';

const REDIRECT_HINT_EXTERNAL =
  'The visitor asked for an external action you cannot perform. Acknowledge warmly that you cannot help with that, then redirect to art and museum topics. Suggest 1-2 art-related follow-up questions in your followUpQuestions field.';

/**
 * Evaluates user input against layered keyword rules.
 * Hard-blocks insults and prompt injections; soft-redirects off-topic and external requests.
 * @param params - The user text and recent conversation history.
 * @returns A guardrail decision indicating whether the message is allowed.
 */
export const evaluateUserInputGuardrail = ({
  text,
  history,
}: EvaluateUserInputParams): GuardrailDecision => {
  const normalizedText = normalize(text || '');
  if (!normalizedText) {
    return { allow: true };
  }

  // 1. Insult → always block (even if greeting present)
  if (hasInsultSignal(normalizedText)) {
    return { allow: false, reason: 'insult' };
  }

  // 2. Injection → always block
  if (hasPromptInjectionSignal(normalizedText)) {
    return { allow: false, reason: 'prompt_injection' };
  }

  // 3. Greeting detected → allow (LLM handles warm welcome)
  if (hasGreetingSignal(normalizedText)) {
    return { allow: true };
  }

  // 4. Short innocuous message (< 15 chars) without insult/injection → allow
  if (isShortInnocuousMessage(normalizedText) && !hasExternalActionSignal(normalizedText)) {
    return { allow: true };
  }

  // 5. Art signal → allow
  if (hasArtSignal(normalizedText)) {
    return { allow: true };
  }

  // 6. External request (benign) → soft redirect via LLM
  if (hasExternalActionSignal(normalizedText)) {
    return { allow: true, redirectHint: REDIRECT_HINT_EXTERNAL };
  }

  // 7. Off-topic (benign) → soft redirect via LLM
  if (hasOffTopicSignal(normalizedText)) {
    return { allow: true, redirectHint: REDIRECT_HINT_OFF_TOPIC };
  }

  // 8. Follow-up + art context → allow
  if (looksLikeFollowUp(normalizedText) && hasArtContext(history)) {
    return { allow: true };
  }

  // 9. Default → off-topic redirect
  return { allow: true, redirectHint: REDIRECT_HINT_OFF_TOPIC };
};

/**
 * Evaluates assistant LLM output for unsafe content, insults, injection leaks, or off-topic drift.
 * Blocks the response if it fails any check.
 * @param params - The assistant text and recent conversation history.
 * @returns A guardrail decision indicating whether the response is safe to return.
 */
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

/**
 * Builds a localized refusal message for the user when the guardrail blocks a message.
 * @param locale - User locale; messages are in French when locale starts with "fr".
 * @param reason - The guardrail block reason, used to select the specific refusal wording.
 * @returns A human-readable refusal string.
 */
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

/**
 * Builds a policy citation string (e.g. `"policy:insult"`) for metadata tagging.
 * @param reason - The guardrail block reason.
 * @returns A citation string, or undefined when no reason is provided.
 */
export const buildGuardrailCitation = (
  reason?: GuardrailBlockReason,
): string | undefined => {
  if (!reason) {
    return undefined;
  }

  return `policy:${reason}`;
};
