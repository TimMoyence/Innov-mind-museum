import { sha256 } from 'js-sha256';

export const GENERIC_TEXT_MAX_LEN = 280;

export const MAX_CACHE_KEY_BYTES = 256;

export interface LocalCacheKeyInput {
  text: string;
  museumId: string;
  locale: string;
  guideLevel?: string;
  audioDescriptionMode?: boolean;
  voiceMode?: boolean;
  userId?: number | string | null;
  anonId?: string | null;
  hasHistory?: boolean;
  hasAttachment?: boolean;
  hasGeo?: boolean;
  geoBucket?: string | null;
}

export function normalizeQuestion(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function isGenericQuery(input: LocalCacheKeyInput): boolean {
  const uid = input.userId;
  if (uid !== undefined && uid !== null && String(uid).length > 0) return false;
  const aid = input.anonId;
  if (aid !== undefined && aid !== null && aid.length > 0) return false;
  const hasHistory = input.hasHistory ?? true;
  const hasAttachment = input.hasAttachment ?? true;
  const hasGeo = input.hasGeo ?? true;
  if (hasHistory) return false;
  if (hasAttachment) return false;
  if (hasGeo) return false;
  if (typeof input.text !== 'string') return false;
  if (input.text.length >= GENERIC_TEXT_MAX_LEN) return false;
  return true;
}

function resolveRequester(input: LocalCacheKeyInput): { namespace: 'user' | 'anon'; id: string } {
  const uid = input.userId;
  if (uid !== undefined && uid !== null && String(uid).length > 0) {
    return { namespace: 'user', id: String(uid) };
  }
  const aid = input.anonId;
  if (aid !== undefined && aid !== null && aid.length > 0) {
    return { namespace: 'anon', id: aid };
  }
  throw new Error(
    'chat-cache-key: scoped key requested without userId or anonId — refusing to leak globally',
  );
}

function shortDigest(components: readonly string[]): string {
  return sha256(components.join('|')).slice(0, 16);
}

export function computeLocalCacheKey(input: LocalCacheKeyInput): string {
  const normalized = normalizeQuestion(input.text);
  const baseComponents = [
    normalized,
    input.locale,
    input.guideLevel ?? 'beginner',
    input.audioDescriptionMode ? '1' : '0',
    input.voiceMode ? '1' : '0',
  ];

  let key: string;
  if (isGenericQuery(input)) {
    key = `chat:llm:global:${input.museumId}:${shortDigest(baseComponents)}`;
  } else {
    const { namespace, id } = resolveRequester(input);
    const components = [...baseComponents];
    if (input.hasHistory) components.push('h:1');
    if (input.hasAttachment) components.push('a:1');
    if (input.hasGeo && input.geoBucket && input.geoBucket.length > 0) {
      components.push(`geo:${input.geoBucket}`);
    }
    key = `chat:llm:${namespace}:${id}:${input.museumId}:${shortDigest(components)}`;
  }

  if (key.length > MAX_CACHE_KEY_BYTES) {
    throw new Error(`chat-cache-key: key exceeds ${String(MAX_CACHE_KEY_BYTES)} bytes`);
  }
  return key;
}
