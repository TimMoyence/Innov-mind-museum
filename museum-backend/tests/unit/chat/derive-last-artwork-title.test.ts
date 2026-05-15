import { deriveLastArtworkTitle } from '@modules/chat/useCase/session/chat-session.service';

import type { VisitContext, VisitedArtwork } from '@modules/chat/domain/chat.types';

// Minimal-overhead fixture: build a VisitContext with the given artworks tail.
// Cast through `unknown` because tests intentionally inject jsonb-drift shapes
// (undefined / null / missing / wrong-type `title`) that the runtime DB column
// can serve but the static `VisitedArtwork` type does not allow.
const makeVisitContext = (artworksDiscussed: Partial<VisitedArtwork>[]): VisitContext =>
  ({
    museumName: 'Louvre',
    museumConfidence: 1,
    artworksDiscussed,
    roomsVisited: [],
    detectedExpertise: 'beginner',
    expertiseSignals: 0,
    lastUpdated: '2026-05-15T00:00:00.000Z',
  }) as unknown as VisitContext;

const baseArtwork = {
  messageId: 'm-1',
  discussedAt: '2026-05-15T00:00:00.000Z',
};

describe('deriveLastArtworkTitle — jsonb data drift defence', () => {
  // ── Drift cases (the bug) ──────────────────────────────────────────────

  it('returns null when last artwork title is undefined (explicit)', () => {
    const ctx = makeVisitContext([{ ...baseArtwork, title: undefined }]);
    expect(deriveLastArtworkTitle(ctx)).toBeNull();
  });

  it('returns null when last artwork title is null', () => {
    const ctx = makeVisitContext([{ ...baseArtwork, title: null as unknown as string }]);
    expect(deriveLastArtworkTitle(ctx)).toBeNull();
  });

  it('returns null when last artwork has no title property at all', () => {
    const ctx = makeVisitContext([{ ...baseArtwork }]);
    expect(deriveLastArtworkTitle(ctx)).toBeNull();
  });

  it('returns null when last artwork title is a non-string (number)', () => {
    const ctx = makeVisitContext([{ ...baseArtwork, title: 123 as unknown as string }]);
    expect(deriveLastArtworkTitle(ctx)).toBeNull();
  });

  // ── Backwards-compatible cases ────────────────────────────────────────

  it('returns null when last artwork title is whitespace-only', () => {
    const ctx = makeVisitContext([{ ...baseArtwork, title: '  ' }]);
    expect(deriveLastArtworkTitle(ctx)).toBeNull();
  });

  it('returns the trimmed title when last artwork title is a non-empty string', () => {
    const ctx = makeVisitContext([{ ...baseArtwork, title: 'La Liseuse' }]);
    expect(deriveLastArtworkTitle(ctx)).toBe('La Liseuse');
  });

  it('returns null when artworksDiscussed is empty', () => {
    const ctx = makeVisitContext([]);
    expect(deriveLastArtworkTitle(ctx)).toBeNull();
  });

  it('returns null when visitContext is null', () => {
    expect(deriveLastArtworkTitle(null)).toBeNull();
  });

  it('returns null when visitContext is undefined', () => {
    expect(deriveLastArtworkTitle(undefined)).toBeNull();
  });
});
