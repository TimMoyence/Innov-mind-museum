/**
 * Shared factory for `CitationSource` test data (C4 citations v2).
 *
 * Per UFR-002 (test discipline / DRY factories) + CLAUDE.md §Test Discipline,
 * tests MUST NOT inline `{ url, type, title, quote } as CitationSource` shapes.
 * Use {@link makeCitationSource} instead.
 *
 * Created 2026-05-11 as part of T2.4 (`sources-validator.ts` TDD).
 *
 * Spec: `team-state/2026-05-11-c4-anti-hallucination/spec.md#R1` (CitationSource).
 * Design: `team-state/2026-05-11-c4-anti-hallucination/design.md#4`.
 */
import type { CitationSource } from '@modules/chat/domain/chat.types';

/**
 * Builds a `CitationSource` with NFR8-compatible defaults (Wikidata Mona Lisa).
 * Override any field via `overrides`.
 *
 * Default `quote` is ≥ 10 normalized chars (clamp NG2 — `quote.length ∈ [10, 500]`).
 *
 * @example
 * makeCitationSource({ type: 'web', quote: 'Painted in 1503.' })
 */
export function makeCitationSource(
  overrides: Partial<CitationSource> = {},
): CitationSource {
  return {
    url: 'https://www.wikidata.org/wiki/Q12418',
    type: 'wikidata',
    title: 'Mona Lisa',
    quote: 'The Mona Lisa is a half-length portrait by Leonardo da Vinci.',
    ...overrides,
  };
}
