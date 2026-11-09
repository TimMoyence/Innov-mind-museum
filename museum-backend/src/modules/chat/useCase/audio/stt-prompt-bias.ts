import { maskPersonalData } from '@shared/pii/mask-personal-data';

import type { VisitContext } from '@modules/chat/domain/chat.types';

const MAX_PROMPT_CHARS = 896;
const SAFE_TOTAL_BUDGET = 880;

const hasPii = (s: string): boolean => maskPersonalData(s).count > 0;

const dedupePreserveOrder = (items: readonly string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (hasPii(trimmed)) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
};

export interface SttPromptBiasInput {
  museumName?: string | null;
  artworks?: { title: string; artist?: string | null }[];
  extraVocabulary?: string[];
}

export const buildSttPromptBias = (input: SttPromptBiasInput): string | undefined => {
  const titles: string[] = [];
  const artists: string[] = [];

  for (const artwork of input.artworks ?? []) {
    if (artwork.title) titles.push(artwork.title);
    if (artwork.artist) artists.push(artwork.artist);
  }

  const tokens: string[] = [];
  if (input.museumName) tokens.push(input.museumName);
  tokens.push(...dedupePreserveOrder(artists));
  tokens.push(...dedupePreserveOrder(titles));
  if (input.extraVocabulary) tokens.push(...dedupePreserveOrder(input.extraVocabulary));

  const cleaned = dedupePreserveOrder(tokens);
  if (cleaned.length === 0) return undefined;

  const out: string[] = [];
  let len = 0;
  for (const token of cleaned) {
    const piece = out.length === 0 ? token : `. ${token}`;
    if (len + piece.length > SAFE_TOTAL_BUDGET) break;
    out.push(piece);
    len += piece.length;
  }
  if (out.length === 0) return undefined;
  const joined = out.join('');
  return joined.length > MAX_PROMPT_CHARS ? joined.slice(0, MAX_PROMPT_CHARS).trimEnd() : joined;
};

export const buildSttPromptBiasFromVisitContext = (
  visitContext: VisitContext | null | undefined,
): string | undefined => {
  if (!visitContext) return undefined;
  return buildSttPromptBias({
    museumName: visitContext.museumName,
    artworks: visitContext.artworksDiscussed.map((a) => ({ title: a.title, artist: a.artist })),
  });
};
