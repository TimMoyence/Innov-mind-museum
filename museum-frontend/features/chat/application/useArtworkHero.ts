/**
 * A2 — Artwork hero card pinned : hook + helpers.
 *
 * Derives the "primary artwork" of a chat session from the message list:
 *   1. First user message with a non-empty `image.url` → primary image.
 *   2. First assistant message (chronologically AFTER the primary user image)
 *      with non-empty `metadata.detectedArtwork.title` → primary metadata.
 *   3. If (1) hits but (2) misses → fallback model with `imageUrl` only.
 *   4. If (1) misses → no hero card at all (`null`).
 *
 * Multi-image is explicitly out of scope (memory `project_c2_ai_side_only`).
 *
 * The hook is pure : `useMemo([messages])` keyed, no side effects, no fetches.
 *
 * The companion `deriveHeroCollapsed` helper computes the collapsed/expanded
 * state from a `scrollY` value + previous state, applying a hysteresis band
 * (collapse @ 80dp / re-expand @ 40dp) to prevent flicker. Caller owns the
 * `isCollapsed` state — the helper stays a stateless function so it is trivial
 * to test and free of React-tree coupling.
 *
 * Spec: docs/chat-ux-refonte/specs/A2.md §1.1 (R1-R7) + §1.4 (R23-R26).
 */

import { useMemo } from 'react';

import type { ChatUiMessage } from './chatSessionLogic.pure';

/** Shape consumed by `<ArtworkHeroCard>` + `<ArtworkHeroModal>`. */
export interface ArtworkHeroModel {
  readonly imageUrl: string;
  /**
   * Id of the user message that carries the uploaded image. Used by the card
   * to re-mint a fresh signed URL + repopulate the durable cache when the
   * embedded `imageUrl` (a signed S3 URL) has expired (D4 carnet re-download).
   * `null` when no source message id is available.
   */
  readonly messageId: string | null;
  readonly title: string | null;
  readonly artist: string | null;
  readonly museum: string | null;
  readonly room: string | null;
  readonly confidence: number | null;
}

/** Scroll offset (dp) at which the hero card transitions to mini-collapsed. */
export const ARTWORK_HERO_COLLAPSE_THRESHOLD = 80;

/** Scroll offset (dp) at which the hero card re-expands once collapsed. */
export const ARTWORK_HERO_EXPAND_THRESHOLD = 40;

const safeTime = (iso: string | undefined): number => {
  if (typeof iso !== 'string' || iso.length === 0) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
};

/**
 * Derives the primary artwork hero model from a list of chat messages.
 *
 * Returns `null` when there is no user-uploaded image in the session. Returns
 * a fallback model (imageUrl-only, all metadata nulled) when the assistant
 * has not yet produced a `detectedArtwork.title` for the user-uploaded image.
 */
export function useArtworkHero(messages: ChatUiMessage[]): ArtworkHeroModel | null {
  return useMemo<ArtworkHeroModel | null>(() => {
    if (messages.length === 0) return null;

    // Sort chronologically (defensive — caller may pass unsorted lists).
    const sorted = [...messages].sort((a, b) => safeTime(a.createdAt) - safeTime(b.createdAt));

    const userImageIdx = sorted.findIndex(
      (m) => m.role === 'user' && typeof m.image?.url === 'string' && m.image.url.length > 0,
    );
    if (userImageIdx < 0) return null;

    const userMsg = sorted[userImageIdx];
    if (!userMsg?.image) return null;
    const imageUrl = userMsg.image.url;
    const userTime = safeTime(userMsg.createdAt);

    const match = sorted.find(
      (m) =>
        m.role === 'assistant' &&
        safeTime(m.createdAt) >= userTime &&
        typeof m.metadata?.detectedArtwork?.title === 'string' &&
        m.metadata.detectedArtwork.title.length > 0,
    );

    if (!match) {
      return {
        imageUrl,
        messageId: userMsg.id,
        title: null,
        artist: null,
        museum: null,
        room: null,
        confidence: null,
      };
    }

    const d = match.metadata?.detectedArtwork;
    return {
      imageUrl,
      messageId: userMsg.id,
      title: d?.title ?? null,
      artist: d?.artist ?? null,
      museum: d?.museum ?? null,
      room: d?.room ?? null,
      confidence: d?.confidence ?? null,
    };
  }, [messages]);
}

/**
 * Pure scroll-collapse derivation with hysteresis.
 *
 *   - When NOT collapsed : collapse the moment `scrollY >= 80`.
 *   - When collapsed : stay collapsed until `scrollY < 40`.
 *
 * The 40dp band prevents flicker at the threshold while scrubbing. The
 * caller owns the `isCollapsed` state in a `useState` ; this helper is
 * a side-effect-free reducer the caller invokes from its `onScroll`.
 */
export function deriveHeroCollapsed(scrollY: number, previousCollapsed: boolean): boolean {
  if (previousCollapsed) {
    return scrollY >= ARTWORK_HERO_EXPAND_THRESHOLD;
  }
  return scrollY >= ARTWORK_HERO_COLLAPSE_THRESHOLD;
}
