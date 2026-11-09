export interface MaskedText {
  text: string;
  count: number;
}

const TRAILING_PUNCTUATION = new Set(['.', ',', ';', ':', '!', '?', ')']);
const LEADING_PUNCTUATION = new Set(['(', '<', '[', '"', "'", '«']);
const LABEL_PREFIX = /^\p{L}{1,24}\.?:/u;
const IBAN_HEAD = /^[A-Z]{2}\d{2}[A-Z0-9]{0,30}$/i;
const IBAN_GROUP = /^[A-Z0-9]{1,4}$/i;
const NUMBER_PART = /^\+?\(?\d{1,19}\)?$/;
const EMAIL_LOCAL = /^[A-Za-z0-9._%+-]{1,64}$/;
const EMAIL_DOMAIN = /^[A-Za-z0-9-]{1,63}$/;
const EMAIL_LOCAL_CHAR = /[A-Za-z0-9._%+-]/;
const EMAIL_DOMAIN_CHAR = /[A-Za-z0-9.-]/;
const TLD = /^[A-Za-z]{2,24}$/;
const MIN_PHONE_DIGITS = 7;
const MIN_PHONE_GROUPS = 3;
const MIN_IBAN_DIGITS = 10;

interface Word {
  head: string;
  core: string;
  tail: string;
  separatorBefore: string;
}

function headLength(part: string, end: number): number {
  let start = 0;
  while (start < end && LEADING_PUNCTUATION.has(part[start])) start += 1;
  const label = LABEL_PREFIX.exec(part.slice(start, end));
  return label && start + label[0].length < end ? start + label[0].length : start;
}

function splitWords(input: string): { words: Word[]; trailing: string } {
  const words: Word[] = [];
  let separator = '';
  for (const part of input.split(/(\s+)/)) {
    if (part === '') continue;
    if (part.trim() === '') {
      separator = part;
      continue;
    }
    let end = part.length;
    while (end > 0 && TRAILING_PUNCTUATION.has(part[end - 1])) end -= 1;
    const start = headLength(part, end);
    words.push({
      head: part.slice(0, start),
      core: part.slice(start, end),
      tail: part.slice(end),
      separatorBefore: separator,
    });
    separator = '';
  }
  return { words, trailing: separator };
}

function continues(words: readonly Word[], end: number): boolean {
  return end < words.length && words[end - 1].tail === '' && words[end].head === '';
}

function looksLikeEmail(candidate: string): boolean {
  const at = candidate.indexOf('@');
  if (at <= 0 || candidate.includes('@', at + 1)) return false;
  const labels = candidate.slice(at + 1).split('.');
  if (labels.length < 2) return false;
  const tld = labels[labels.length - 1];
  return (
    EMAIL_LOCAL.test(candidate.slice(0, at)) &&
    TLD.test(tld) &&
    labels.slice(0, -1).every((label) => EMAIL_DOMAIN.test(label))
  );
}

export function replaceEmails(core: string, replace: (email: string) => string): MaskedText {
  let text = core;
  let count = 0;
  let from = 0;
  for (let at = text.indexOf('@', from); at >= 0; at = text.indexOf('@', from)) {
    let start = at;
    while (start > 0 && EMAIL_LOCAL_CHAR.test(text[start - 1])) start -= 1;
    let end = at + 1;
    while (end < text.length && EMAIL_DOMAIN_CHAR.test(text[end])) end += 1;
    while (end > at + 1 && text[end - 1] === '.') end -= 1;
    const candidate = text.slice(start, end);
    if (looksLikeEmail(candidate)) {
      const replacement = replace(candidate);
      text = `${text.slice(0, start)}${replacement}${text.slice(end)}`;
      count += 1;
      from = start + replacement.length;
    } else {
      from = at + 1;
    }
  }
  return { text, count };
}

function maskEmails(core: string): MaskedText {
  return replaceEmails(core, () => '[EMAIL]');
}

function digitCount(parts: readonly string[]): number {
  return parts.reduce((sum, part) => sum + part.replace(/\D/g, '').length, 0);
}

function isIbanGroup(core: string): boolean {
  return IBAN_GROUP.test(core) && (/\d/.test(core) || core === core.toUpperCase());
}

function takeIban(words: readonly Word[], start: number): number {
  const groups = words[start].core.split('-');
  if (!IBAN_HEAD.test(groups[0]) || !groups.slice(1).every(isIbanGroup)) return 0;
  let end = start + 1;
  while (continues(words, end) && isIbanGroup(words[end].core)) {
    groups.push(words[end].core);
    end += 1;
  }
  const length = groups.join('').length;
  return length >= 15 && length <= 34 && digitCount(groups) >= MIN_IBAN_DIGITS ? end - start : 0;
}

function takeNumber(words: readonly Word[], start: number): { size: number; label: string } | null {
  const groups: string[] = [];
  let end = start;
  while (end === start || continues(words, end)) {
    const parts = words[end].core.split(/[-.]/);
    if (!parts.every((part) => NUMBER_PART.test(part))) break;
    groups.push(...parts);
    end += 1;
  }
  if (end === start) return null;
  const label = numberLabel(groups, words[start].core.startsWith('+'));
  return label ? { size: end - start, label } : null;
}

function numberLabel(groups: readonly string[], international: boolean): string | null {
  const digits = digitCount(groups);
  if (digits >= 13 && digits <= 19 && (groups.length === 1 || groups.length >= 3)) return '[CARD]';
  const compact = groups.length === 1 && digits >= 10 && digits <= 12;
  const phoneShape = groups.length >= MIN_PHONE_GROUPS || international || compact;
  return digits >= MIN_PHONE_DIGITS && phoneShape ? '[PHONE]' : null;
}

function classify(words: readonly Word[], index: number): { size: number; label: string | null } {
  const iban = takeIban(words, index);
  if (iban > 0) return { size: iban, label: '[IBAN]' };
  return takeNumber(words, index) ?? { size: 1, label: null };
}

export function maskPersonalData(input: string): MaskedText {
  const { words, trailing } = splitWords(input);
  let count = 0;
  let text = '';
  let index = 0;
  while (index < words.length) {
    const word = words[index];
    const { size, label } = classify(words, index);
    const masked = label ? { text: label, count: 1 } : maskEmails(word.core);
    count += masked.count;
    text += word.separatorBefore + word.head + masked.text + words[index + size - 1].tail;
    index += size;
  }
  return { text: text + trailing, count };
}
