import { GUARDRAIL_REFUSALS } from '@shared/i18n/guardrail-refusals';
import { resolveLocale } from '@shared/i18n/locale';

/** Reason why the guardrail blocked or flagged a message. */
export type GuardrailBlockReason = 'insult' | 'prompt_injection' | 'off_topic' | 'unsafe_output';

/**
 * Result of a guardrail evaluation.
 * When `allow` is false the message is blocked.
 */
export interface GuardrailDecision {
  allow: boolean;
  reason?: GuardrailBlockReason;
}

export const normalize = (value: string): string => {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

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

const INJECTION_PATTERNS = [
  // English
  'ignore previous',
  'ignore all instructions',
  'ignore above',
  'ignore the above',
  'disregard previous',
  'disregard all',
  'disregard instructions',
  'bypass',
  'jailbreak',
  'system prompt',
  'reveal your prompt',
  'show your instructions',
  'print your system',
  'repeat your instructions',
  'developer mode',
  'override instructions',
  'new instructions',
  'act as if',
  'pretend you are',
  'you are now',
  'from now on',
  'roleplay as',
  'do anything now',
  'dan mode',
  // French
  'ignore les instructions',
  'ignore tout ce qui precede',
  'oublie les instructions',
  'oublie toutes les regles',
  'mode developpeur',
  'contourne les regles',
  'tu es maintenant',
  'agis comme si',
  // German
  'ignoriere die vorherigen',
  'ignoriere alle anweisungen',
  'vergiss alle anweisungen',
  'vergiss die regeln',
  'du bist jetzt',
  'tu so als ob',
  'entwicklermodus',
  'systemaufforderung',
  // Spanish
  'ignora las instrucciones anteriores',
  'ignora todas las instrucciones',
  'olvida todas las reglas',
  'olvida las instrucciones',
  'ahora eres',
  'actua como si',
  'modo desarrollador',
  // Italian
  'ignora le istruzioni precedenti',
  'ignora tutte le istruzioni',
  'dimentica tutte le regole',
  'dimentica le istruzioni',
  'ora sei',
  'fai finta di essere',
  'modalita sviluppatore',
  // Japanese (CJK — matched via includes())
  '前の指示を無視',
  'すべての指示を無視',
  'すべてのルールを忘れて',
  '指示を忘れて',
  '開発者モード',
  'システムプロンプト',
  // Japanese romaji fallback
  'mae no shiji wo mushi',
  'kaihatsusha mode',
  // Chinese (CJK — matched via includes())
  '忽略之前的指令',
  '忽略所有指令',
  '忘记所有规则',
  '忘记指令',
  '开发者模式',
  '系统提示',
  '你现在是',
  // Arabic (matched via includes())
  'تجاهل التعليمات السابقة',
  'تجاهل جميع التعليمات',
  'انسى كل القواعد',
  'انسى التعليمات',
  'وضع المطور',
  'أنت الآن',
];

const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const isCjk = (s: string): boolean => /[\u3000-\u9fff\uf900-\ufaff]/.test(s);
const isArabic = (s: string): boolean =>
  /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff]/.test(s);

const containsKeyword = (normalizedText: string, keyword: string): boolean => {
  // Apply the same normalization to the keyword as to the input text so NFD
  // decomposition (e.g. Japanese dakuten, Latin accents) is consistent on both sides.
  const normalizedKeyword = normalize(keyword);

  // CJK and Arabic scripts don't have ASCII word boundaries — always use includes().
  // Arabic combining marks are stripped by normalize() via the \u0300-\u036f range, but
  // Arabic diacritics (\u064b-\u0652) remain — includes() stays safe either way.
  if (isCjk(normalizedKeyword) || isArabic(normalizedKeyword)) {
    return normalizedText.includes(normalizedKeyword);
  }

  if (normalizedKeyword.includes(' ') || normalizedKeyword.length <= 3) {
    const pattern = new RegExp(`(^|\\b)${escapeRegExp(normalizedKeyword)}(\\b|$)`);
    return pattern.test(normalizedText);
  }

  return normalizedText.includes(normalizedKeyword);
};

const includesAny = (normalizedText: string, keywords: string[]): boolean => {
  return keywords.some((keyword) => containsKeyword(normalizedText, keyword));
};

export const hasInsultSignal = (normalizedText: string): boolean => {
  return includesAny(normalizedText, INSULT_KEYWORDS);
};

export const hasPromptInjectionSignal = (normalizedText: string): boolean => {
  return includesAny(normalizedText, INJECTION_PATTERNS);
};

/**
 * Evaluates user input against guardrail rules.
 * Hard-blocks insults and prompt injections; everything else is allowed.
 *
 * @param root0 - The user text to evaluate.
 * @param root0.text - User message text to evaluate.
 * @returns A guardrail decision indicating whether the message is allowed.
 */
export const evaluateUserInputGuardrail = ({ text }: { text?: string }): GuardrailDecision => {
  const normalizedText = normalize(text ?? '');
  if (!normalizedText) return { allow: true };

  if (hasInsultSignal(normalizedText)) return { allow: false, reason: 'insult' };
  if (hasPromptInjectionSignal(normalizedText)) return { allow: false, reason: 'prompt_injection' };

  return { allow: true };
};

/**
 * Evaluates assistant LLM output for unsafe content, insults, or injection leaks.
 * Blocks the response if it fails any check.
 *
 * @param root0 - The assistant text to evaluate.
 * @param root0.text - Assistant response text to evaluate.
 * @returns A guardrail decision indicating whether the response is safe to return.
 */
export const evaluateAssistantOutputGuardrail = ({ text }: { text: string }): GuardrailDecision => {
  const normalizedText = normalize(text);
  // 1. Empty -> block
  if (!normalizedText) {
    return { allow: false, reason: 'unsafe_output' };
  }
  // 2. Insult -> block
  if (hasInsultSignal(normalizedText)) {
    return { allow: false, reason: 'unsafe_output' };
  }
  // 3. Injection -> block
  if (hasPromptInjectionSignal(normalizedText)) {
    return { allow: false, reason: 'unsafe_output' };
  }
  // 4. Default -> allow
  return { allow: true };
};

/**
 * Builds a localized refusal message for the user when the guardrail blocks a message.
 * Supports all 7 locales via the GUARDRAIL_REFUSALS dictionary.
 *
 * @param locale - User locale tag (e.g. "fr-FR", "de", "ja").
 * @param reason - The guardrail block reason, used to select the specific refusal wording.
 * @returns A human-readable refusal string.
 */
export const buildGuardrailRefusal = (
  locale: string | undefined,
  reason?: GuardrailBlockReason,
): string => {
  const resolved = resolveLocale([locale]);
  const messages = GUARDRAIL_REFUSALS[resolved];

  if (reason === 'insult') return messages.insult;
  return messages.default;
};

/**
 * Builds a policy citation string (e.g. `"policy:insult"`) for metadata tagging.
 *
 * @param reason - The guardrail block reason.
 * @returns A citation string, or undefined when no reason is provided.
 */
export const buildGuardrailCitation = (reason?: GuardrailBlockReason): string | undefined => {
  if (!reason) {
    return undefined;
  }

  return `policy:${reason}`;
};
