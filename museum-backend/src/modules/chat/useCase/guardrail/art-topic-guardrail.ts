import { GUARDRAIL_REFUSALS } from '@shared/i18n/guardrail-refusals';
import { resolveLocale } from '@shared/i18n/locale';

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

const ZERO_WIDTH_RE = /[\u200b-\u200d\u2060\ufeff]/g;

const HOMOGLYPH_FOLD: Record<string, string> = {
  а: 'a',
  в: 'b',
  е: 'e',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  у: 'y',
  х: 'x',
  ѕ: 's',
  і: 'i',
  ј: 'j',
  α: 'a',
  β: 'b',
  ε: 'e',
  ι: 'i',
  κ: 'k',
  ν: 'v',
  ο: 'o',
  ρ: 'p',
  τ: 't',
  υ: 'u',
  χ: 'x',
  γ: 'y',
};

const foldHomoglyphs = (value: string): string =>
  value.replace(/[\u0370-\u03ff\u0400-\u04ff]/g, (ch) => HOMOGLYPH_FOLD[ch] ?? ch);

const looksLikePrintableProse = (text: string): boolean => {
  let printable = 0;
  let hasLetter = false;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    const isPrintable =
      (code >= 0x20 && code <= 0x7e) || code === 0x09 || code === 0x0a || code === 0x0d;
    if (isPrintable) printable += 1;
    if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) hasLetter = true;
  }
  return hasLetter && printable / text.length >= 0.85;
};

const decodeBase64Candidate = (candidate: string): string | null => {
  let text: string;
  try {
    text = Buffer.from(candidate, 'base64').toString('utf8');
  } catch {
    return null;
  }
  return text && looksLikePrintableProse(text) ? text : null;
};

const decodeBase64Candidates = (rawValue: string): string => {
  const candidates = rawValue.match(/[A-Za-z0-9+/]{16,}={0,2}/g);
  if (!candidates) return '';

  const decoded = candidates
    .map(decodeBase64Candidate)
    .filter((text): text is string => text !== null);
  return decoded.length ? ` ${decoded.join(' ')}` : '';
};

export const normalize = (value: string): string => {
  const decodedPayloads = decodeBase64Candidates(value);

  return foldHomoglyphs(`${value}${decodedPayloads}`.replace(ZERO_WIDTH_RE, ''))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const INSULT_KEYWORDS = [
  'idiot',
  'stupid',
  'moron',
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'connard',
  'salope',
  'pute',
  'encule',
  'fdp',
  'nique ta mere',
  'ta gueule',
  'arschloch',
  'scheisse',
  'hurensohn',
  'wichser',
  'verpiss dich',
  'pendejo',
  'gilipollas',
  'cabron',
  'hijo de puta',
  'mierda',
  'stronzo',
  'coglione',
  'vaffanculo',
  'figlio di puttana',
  'cazzo',
  'バカ',
  '馬鹿',
  'クソ',
  'くたばれ',
  '死ね',
  '傻逼',
  '混蛋',
  '操你',
  '去死',
  '白痴',
  'احمق',
  'غبي',
  'كلب',
  'تبا لك',
  'اخرس',
];

const INJECTION_PATTERNS = [
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
  'ignore les instructions',
  'ignore tout ce qui precede',
  'oublie les instructions',
  'oublie toutes les regles',
  'mode developpeur',
  'contourne les regles',
  'tu es maintenant',
  'agis comme si',
  'ignoriere die vorherigen',
  'ignoriere alle anweisungen',
  'vergiss alle anweisungen',
  'vergiss die regeln',
  'du bist jetzt',
  'tu so als ob',
  'entwicklermodus',
  'systemaufforderung',
  'ignora las instrucciones anteriores',
  'ignora todas las instrucciones',
  'olvida todas las reglas',
  'olvida las instrucciones',
  'ahora eres',
  'actua como si',
  'modo desarrollador',
  'ignora le istruzioni precedenti',
  'ignora tutte le istruzioni',
  'dimentica tutte le regole',
  'dimentica le istruzioni',
  'ora sei',
  'fai finta di essere',
  'modalita sviluppatore',
  '前の指示を無視',
  'すべての指示を無視',
  'すべてのルールを忘れて',
  '指示を忘れて',
  '開発者モード',
  'システムプロンプト',
  'mae no shiji wo mushi',
  'kaihatsusha mode',
  '忽略之前的指令',
  '忽略所有指令',
  '忘记所有规则',
  '忘记指令',
  '开发者模式',
  '系统提示',
  '你现在是',
  'تجاهل التعليمات السابقة',
  'تجاهل جميع التعليمات',
  'انسى كل القواعد',
  'انسى التعليمات',
  'وضع المطور',
  'أنت الآن',
];

const isCjk = (s: string): boolean => /[\u3000-\u9fff\uf900-\ufaff]/.test(s);
const isArabic = (s: string): boolean =>
  /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff]/.test(s);

const WORD_CHAR = /\w/;

const isWordChar = (char: string | undefined): boolean =>
  char !== undefined && WORD_CHAR.test(char);

const isBoundary = (left: string | undefined, right: string | undefined): boolean =>
  isWordChar(left) !== isWordChar(right);

const containsWholeWord = (text: string, word: string): boolean => {
  for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + 1)) {
    const end = at + word.length;
    const before = at === 0 || isBoundary(text[at - 1], word[0]);
    const after = end === text.length || isBoundary(word[word.length - 1], text[end]);
    if (before && after) return true;
  }
  return false;
};

const containsKeyword = (normalizedText: string, keyword: string): boolean => {
  const normalizedKeyword = normalize(keyword);

  if (isCjk(normalizedKeyword) || isArabic(normalizedKeyword)) {
    return normalizedText.includes(normalizedKeyword);
  }

  if (normalizedKeyword.includes(' ') || normalizedKeyword.length <= 3) {
    return containsWholeWord(normalizedText, normalizedKeyword);
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

export const evaluateUserInputGuardrail = ({ text }: { text?: string }): GuardrailDecision => {
  const normalizedText = normalize(text ?? '');
  if (!normalizedText) return { allow: true };

  if (hasInsultSignal(normalizedText)) return { allow: false, reason: 'insult' };
  if (hasPromptInjectionSignal(normalizedText)) return { allow: false, reason: 'prompt_injection' };

  return { allow: true };
};

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
