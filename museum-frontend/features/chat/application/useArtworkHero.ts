import { useMemo } from 'react';

import type { ChatUiMessage } from './chatSessionLogic.pure';

export interface ArtworkHeroModel {
  readonly imageUrl: string;
  readonly messageId: string | null;
  readonly title: string | null;
  readonly artist: string | null;
  readonly museum: string | null;
  readonly room: string | null;
  readonly confidence: number | null;
}

export const ARTWORK_HERO_COLLAPSE_THRESHOLD = 80;

export const ARTWORK_HERO_EXPAND_THRESHOLD = 40;

const safeTime = (iso: string | undefined): number => {
  if (typeof iso !== 'string' || iso.length === 0) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
};

export function useArtworkHero(messages: ChatUiMessage[]): ArtworkHeroModel | null {
  return useMemo<ArtworkHeroModel | null>(() => {
    if (messages.length === 0) return null;

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

export function deriveHeroCollapsed(scrollY: number, previousCollapsed: boolean): boolean {
  if (previousCollapsed) {
    return scrollY >= ARTWORK_HERO_EXPAND_THRESHOLD;
  }
  return scrollY >= ARTWORK_HERO_COLLAPSE_THRESHOLD;
}
