/**
 * Shared factories for `EnrichedImage` and `SuggestedImage` test data.
 *
 * Per UFR-002 (test discipline / DRY factories), tests MUST NOT inline
 * `{ ... } as EnrichedImage` shapes. Use {@link makeEnrichedImage} or
 * {@link makeSuggestedImage} instead.
 *
 * Created 2026-05-10 as part of C2 image-chat finition (v2 schema rollout).
 */
import type { EnrichedImage, SuggestedImage } from '@modules/chat/domain/chat.types';

/**
 * Builds an `EnrichedImage` with sensible v2 defaults (rationale + caption
 * present). Override any field via `overrides`.
 *
 * @example
 * makeEnrichedImage({ source: 'commons', score: 0.6 })
 */
export function makeEnrichedImage(overrides: Partial<EnrichedImage> = {}): EnrichedImage {
  return {
    url: 'https://example.com/image.jpg',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    caption: 'Test artwork caption',
    rationale: 'Illustrates the discussed artwork.',
    source: 'wikidata',
    score: 0.5,
    ...overrides,
  };
}

/**
 * Builds a `SuggestedImage` v2 entry with sensible defaults.
 *
 * @example
 * makeSuggestedImage({ query: 'Mona Lisa', rationale: 'The work being discussed.' })
 */
export function makeSuggestedImage(overrides: Partial<SuggestedImage> = {}): SuggestedImage {
  return {
    query: 'Test artwork',
    description: 'A test artwork to enrich the response.',
    rationale: 'Adds visual context to the answer.',
    caption: 'Test artwork',
    ...overrides,
  };
}
