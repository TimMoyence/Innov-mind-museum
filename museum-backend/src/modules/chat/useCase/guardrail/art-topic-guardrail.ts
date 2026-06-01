import { GUARDRAIL_REFUSALS } from '@shared/i18n/guardrail-refusals';
import { resolveLocale } from '@shared/i18n/locale';

/**
 * ADR-047 — `service_unavailable` distinct from `unsafe_output`: signals
 * sidecar could not produce a verdict (timeout/non-OK/breaker/semaphore).
 * User-facing copy is honest ("Service unavailable, retry") instead of
 * misleading "your content was flagged".
 */
export type GuardrailBlockReason =
  | 'insult'
  | 'prompt_injection'
  | 'off_topic'
  | 'unsafe_output'
  | 'service_unavailable';

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

// F4 — 8-language coverage matches INJECTION_PATTERNS reach (closes asymmetry
// where DE/ES/IT/JA/ZH/AR insults bypassed pre-filter while injection didn't).
// CJK/Arabic matched via includes().
const INSULT_KEYWORDS = [
  // English
  'idiot',
  'stupid',
  'moron',
  'fuck',
  'shit',
  'bitch',
  'asshole',
  // French
  'connard',
  'salope',
  'pute',
  'encule',
  'fdp',
  'nique ta mere',
  'ta gueule',
  // German
  'arschloch',
  'scheisse',
  'hurensohn',
  'wichser',
  'verpiss dich',
  // Spanish
  'pendejo',
  'gilipollas',
  'cabron',
  'hijo de puta',
  'mierda',
  // Italian
  'stronzo',
  'coglione',
  'vaffanculo',
  'figlio di puttana',
  'cazzo',
  // Japanese (CJK — matched via includes())
  'バカ',
  '馬鹿',
  'クソ',
  'くたばれ',
  '死ね',
  // Chinese (CJK — matched via includes())
  '傻逼',
  '混蛋',
  '操你',
  '去死',
  '白痴',
  // Arabic (matched via includes())
  'احمق',
  'غبي',
  'كلب',
  'تبا لك',
  'اخرس',
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
  // NFD on both sides: consistent decomposition (dakuten, Latin accents).
  const normalizedKeyword = normalize(keyword);

  // CJK and Arabic scripts don't have ASCII word boundaries — always use includes().
  // Arabic combining marks are stripped by normalize() via the \u0300-\u036f range, but
  // Arabic diacritics (\u064b-\u0652) remain — includes() stays safe either way.
  if (isCjk(normalizedKeyword) || isArabic(normalizedKeyword)) {
    return normalizedText.includes(normalizedKeyword);
  }

  if (normalizedKeyword.includes(' ') || normalizedKeyword.length <= 3) {
    // eslint-disable-next-line security/detect-non-literal-regexp -- keyword is escaped via escapeRegExp; bounded by \b anchors
    const pattern = new RegExp(`(^|\\b)${escapeRegExp(normalizedKeyword)}(\\b|$)`); // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
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

/** Hard-blocks insults + prompt injections; everything else allowed. */
export const evaluateUserInputGuardrail = ({ text }: { text?: string }): GuardrailDecision => {
  const normalizedText = normalize(text ?? '');
  if (!normalizedText) return { allow: true };

  if (hasInsultSignal(normalizedText)) return { allow: false, reason: 'insult' };
  if (hasPromptInjectionSignal(normalizedText)) return { allow: false, reason: 'prompt_injection' };

  return { allow: true };
};

/** Blocks empty / insult / injection leaks in LLM output. */
export const evaluateAssistantOutputGuardrail = ({ text }: { text: string }): GuardrailDecision => {
  const normalizedText = normalize(text);
  if (!normalizedText) {
    return { allow: false, reason: 'unsafe_output' };
  }
  if (hasInsultSignal(normalizedText)) {
    return { allow: false, reason: 'unsafe_output' };
  }
  if (hasPromptInjectionSignal(normalizedText)) {
    return { allow: false, reason: 'unsafe_output' };
  }
  return { allow: true };
};

export const buildGuardrailRefusal = (
  locale: string | undefined,
  reason?: GuardrailBlockReason,
  /**
   * Hybrid-gravity guardrail (2026-06-01) — when true, an off-topic block uses
   * the warmer `refocus` cool-down copy instead of the flat `default`. Set by
   * the friction escalation path; the legacy inline off-topic block leaves it
   * false so its wording is unchanged.
   */
  useRefocus = false,
): string => {
  const resolved = resolveLocale([locale]);
  const messages = GUARDRAIL_REFUSALS[resolved];

  if (reason === 'insult') return messages.insult;
  if (reason === 'service_unavailable') return messages.serviceUnavailable;
  if (useRefocus && reason === 'off_topic') return messages.refocus;
  return messages.default;
};

export const buildGuardrailCitation = (reason?: GuardrailBlockReason): string | undefined => {
  if (!reason) return undefined;
  return `policy:${reason}`;
};
