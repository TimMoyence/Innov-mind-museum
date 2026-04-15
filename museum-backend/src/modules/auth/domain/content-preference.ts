/**
 * Aspects a visitor may prefer to learn about when exploring an artwork.
 * - `history`: the historical context, provenance, creation circumstances
 * - `technique`: the visual representation, style, materials, composition
 * - `artist`: the artist's biography, influences, life events
 *
 * Visitors can opt into zero, one, two, or all three. The LLM uses these hints
 * to emphasize preferred aspects when naturally relevant, without forcing them.
 */
export type ContentPreference = 'history' | 'technique' | 'artist';

/** Exhaustive list for runtime validation. Single source of truth. */
export const CONTENT_PREFERENCES: readonly ContentPreference[] = ['history', 'technique', 'artist'];

/** Type guard for runtime validation of incoming values. */
export const isContentPreference = (value: unknown): value is ContentPreference =>
  typeof value === 'string' && (CONTENT_PREFERENCES as readonly string[]).includes(value);
