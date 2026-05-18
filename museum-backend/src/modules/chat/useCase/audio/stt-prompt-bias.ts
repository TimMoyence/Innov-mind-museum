import type { VisitContext } from '@modules/chat/domain/chat.types';

/**
 * W7.4 (2026-05-17) — STT prompt biasing for proper-noun recall.
 *
 * Builds a short string fed to OpenAI's `/audio/transcriptions` `prompt`
 * param. Whisper-family models honor the prompt as a vocabulary hint —
 * pre-populating the language model with the artist names + artwork titles
 * + museum name the visitor is likely to mention boosts WER on French/
 * English proper nouns by 15-30 % (Picasso, Vermeer, Caravage, Léonard de
 * Vinci, etc.).
 *
 * Hard cap : 896 chars (~224 tokens, OpenAI's documented limit). Truncation
 * is name-boundary-safe (drops the last partial entry rather than cutting
 * mid-word).
 *
 * PII safety : visitor PII MUST NOT appear in the prompt because the
 * provider treats it as opaque conditioning text. Museum data is public.
 * Visitor data (email, free-form name) is filtered defensively below.
 */
const MAX_PROMPT_CHARS = 896;
const SAFE_TOTAL_BUDGET = 880;

// Conservative defensive filter — drops obviously-personal tokens. The
// upstream data sources (museum vocab, VisitedArtwork) should never contain
// PII; this exists in case a future code path passes user-derived strings.
// Defensive PII filters. Patterns kept *intentionally cheap and bounded* —
// linear scans, no nested quantifiers, sonarjs/slow-regex safe.
const DIGIT_RUN = /\d{7}/;

const hasPii = (s: string): boolean => {
  if (s.includes('@')) return true;
  // Strip non-digits, then check for any 7+ digit run (covers phone/card
  // numbers expressed with various separators without backtracking).
  return DIGIT_RUN.test(s.replace(/\D+/g, ''));
};

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
  /** Subset of session.visitContext.artworksDiscussed (recent or all). */
  artworks?: { title: string; artist?: string | null }[];
  /** Optional pre-curated vocabulary (admin-supplied, future). */
  extraVocabulary?: string[];
}

/**
 * Returns `undefined` when there is nothing to bias — the adapter will then
 * omit the `prompt` form field entirely (default OpenAI behavior preserved).
 */
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

  // Whisper prompts work best as a single fluent line of proper nouns
  // separated by ". " — mimics natural speech transition. We greedily fill
  // up to SAFE_TOTAL_BUDGET, dropping the trailing partial when over.
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

/** Convenience wrapper for the `VisitContext` shape used by chat sessions. */
export const buildSttPromptBiasFromVisitContext = (
  visitContext: VisitContext | null | undefined,
): string | undefined => {
  if (!visitContext) return undefined;
  return buildSttPromptBias({
    museumName: visitContext.museumName,
    artworks: visitContext.artworksDiscussed.map((a) => ({ title: a.title, artist: a.artist })),
  });
};
