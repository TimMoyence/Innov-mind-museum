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

// H10 \u2014 adversarial obfuscation hardening (homoglyph / base64 / zero-width).
//
// Zero-width / invisible separators an attacker can splice INTO a keyword
// (e.g. "ign\u200bore previous") so the plaintext substring never matches.
// Stripped first so the fold + keyword scan see the contiguous word.
const ZERO_WIDTH_RE = /[\u200b-\u200d\u2060\ufeff]/g;

// Curated Cyrillic + Greek \u2192 Latin homoglyph fold. ONLY the look-alike letters
// an attacker substitutes to defeat the Latin keyword list (Cyrillic '\u043e'/Greek
// omicron in "ignore", etc.). Deliberately NOT a full transliteration: a real
// Cyrillic word (Russian art question) folds to Latin gibberish, never into an
// injection pattern \u2014 that keeps the multilingual allow-cases green. CJK and
// Arabic ranges are intentionally absent (their keywords match via includes()).
const HOMOGLYPH_FOLD: Record<string, string> = {
  // Cyrillic (U+04xx) look-alikes
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
  // Greek (U+03xx) look-alikes
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

/**
 * True when a decoded blob looks like genuine printable prose: mostly printable
 * ASCII (rejects hex-hash / random-token binary garbage) AND contains at least
 * one ASCII letter (so a numeric/punctuation blob can't masquerade as prose).
 */
const looksLikePrintableProse = (text: string): boolean => {
  let printable = 0;
  let hasLetter = false;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    // printable ASCII range + common whitespace (tab / LF / CR)
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

/**
 * Base64-candidate decode (H10). Adversaries hide an injection inside an
 * encoded blob ("Please decode this: SWdub3Jl\u2026"). We scan the RAW,
 * case-preserved text for base64-alphabet runs (>=16 chars so short artwork /
 * inventory tokens are ignored), decode each, and keep ONLY decodes that look
 * like genuine printable prose. Hex hashes and base64-shaped artwork tokens
 * decode to binary garbage and are dropped here, so the keyword scan never
 * sees them \u2014 that conjunction is what keeps the false-positive guards green.
 * Decoded prose is appended so the existing INJECTION_PATTERNS catch any
 * injection it carries.
 */
const decodeBase64Candidates = (rawValue: string): string => {
  const candidates = rawValue.match(/[A-Za-z0-9+/]{16,}={0,2}/g);
  if (!candidates) return '';

  const decoded = candidates
    .map(decodeBase64Candidate)
    .filter((text): text is string => text !== null);
  return decoded.length ? ` ${decoded.join(' ')}` : '';
};

export const normalize = (value: string): string => {
  // Decode base64 candidates from the RAW, case-preserved text BEFORE
  // lower-casing/stripping \u2014 base64 is case-sensitive (INV-5/INV-6). The decoded
  // prose is folded through the same normalization below so an injection inside
  // the blob matches the keyword list.
  const decodedPayloads = decodeBase64Candidates(value);

  return foldHomoglyphs(`${value}${decodedPayloads}`.replace(ZERO_WIDTH_RE, ''))
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
