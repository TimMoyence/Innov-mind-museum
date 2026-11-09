import type React from 'react';
import { render } from '@testing-library/react-native';

import '../../helpers/test-utils';
import { makeChatUiMessage, makeAssistantMessage } from '../../helpers/factories/chat.factories';

import {
  useArtworkHero,
  deriveHeroCollapsed,
  ARTWORK_HERO_COLLAPSE_THRESHOLD,
  ARTWORK_HERO_EXPAND_THRESHOLD,
  type ArtworkHeroModel,
} from '@/features/chat/application/useArtworkHero';

import type { ChatUiMessage } from '@/features/chat/application/chatSessionLogic.pure';

function HookProbe({
  messages,
  capture,
}: {
  messages: ChatUiMessage[];
  capture: (value: ArtworkHeroModel | null) => void;
}): React.ReactElement | null {
  const value = useArtworkHero(messages);
  capture(value);
  return null;
}

function runHook(messages: ChatUiMessage[]): ArtworkHeroModel | null {
  let captured: ArtworkHeroModel | null | undefined = undefined;
  render(<HookProbe messages={messages} capture={(v) => (captured = v)} />);
  if (captured === undefined) throw new Error('useArtworkHero never returned');
  return captured;
}

describe('useArtworkHero (A2 hook)', () => {
  it('returns null on empty messages (R1, AC2)', () => {
    expect(runHook([])).toBeNull();
  });

  it('returns null when no user message has image (R2, AC3)', () => {
    const m1 = makeChatUiMessage({ role: 'user', text: 'hello', image: null });
    const m2 = makeAssistantMessage({ text: 'hi' });
    expect(runHook([m1, m2])).toBeNull();
  });

  it('returns "untitled" model when user image exists but no assistant detectedArtwork (R3 + R5, AC4)', () => {
    const m1 = makeChatUiMessage({
      role: 'user',
      text: 'what is this?',
      image: { url: 'https://signed.example.com/image1.jpg', expiresAt: 'never' },
      createdAt: '2026-05-14T10:00:00.000Z',
    });
    const result = runHook([m1]);
    expect(result).not.toBeNull();
    expect(result?.imageUrl).toBe('https://signed.example.com/image1.jpg');
    expect(result?.title).toBeNull();
    expect(result?.artist).toBeNull();
    expect(result?.museum).toBeNull();
    expect(result?.room).toBeNull();
    expect(result?.confidence).toBeNull();
  });

  it('returns full model when user image is paired with assistant detectedArtwork (R4, AC5)', () => {
    const userMsg = makeChatUiMessage({
      role: 'user',
      text: 'look at this',
      image: { url: 'https://signed.example.com/mona.jpg', expiresAt: 'never' },
      createdAt: '2026-05-14T10:00:00.000Z',
    });
    const assistantMsg = makeAssistantMessage(
      { createdAt: '2026-05-14T10:00:05.000Z' },
      {
        detectedArtwork: {
          title: 'Mona Lisa',
          artist: 'Leonardo da Vinci',
          museum: 'Louvre',
          room: 'Salle des États',
          confidence: 0.93,
        },
      },
    );

    const result = runHook([userMsg, assistantMsg]);
    expect(result?.imageUrl).toBe('https://signed.example.com/mona.jpg');
    expect(result?.title).toBe('Mona Lisa');
    expect(result?.artist).toBe('Leonardo da Vinci');
    expect(result?.museum).toBe('Louvre');
    expect(result?.room).toBe('Salle des États');
    expect(result?.confidence).toBe(0.93);
  });

  it('ignores assistant detectedArtwork chronologically BEFORE the user image (R4 chronological, AC6)', () => {
    const earlyAssistant = makeAssistantMessage(
      { createdAt: '2026-05-14T09:00:00.000Z' },
      {
        detectedArtwork: {
          title: 'Old Match',
          artist: 'Old Artist',
        },
      },
    );
    const userMsg = makeChatUiMessage({
      role: 'user',
      image: { url: 'https://signed.example.com/new.jpg', expiresAt: 'never' },
      createdAt: '2026-05-14T10:00:00.000Z',
    });

    const result = runHook([earlyAssistant, userMsg]);
    expect(result?.imageUrl).toBe('https://signed.example.com/new.jpg');
    expect(result?.title).toBeNull();
  });

  it('returns the FIRST user image when multiple are present (R3 chronological, AC7)', () => {
    const u1 = makeChatUiMessage({
      role: 'user',
      image: { url: 'https://signed.example.com/first.jpg', expiresAt: 'never' },
      createdAt: '2026-05-14T10:00:00.000Z',
    });
    const u2 = makeChatUiMessage({
      role: 'user',
      image: { url: 'https://signed.example.com/second.jpg', expiresAt: 'never' },
      createdAt: '2026-05-14T10:05:00.000Z',
    });

    const result = runHook([u1, u2]);
    expect(result?.imageUrl).toBe('https://signed.example.com/first.jpg');
  });

  it('skips system messages (R7, AC8)', () => {
    const sys = makeChatUiMessage({
      role: 'system',
      text: 'system boot',
      image: { url: 'https://signed.example.com/system.jpg', expiresAt: 'never' },
      createdAt: '2026-05-14T09:00:00.000Z',
    });
    const u1 = makeChatUiMessage({
      role: 'user',
      image: { url: 'https://signed.example.com/user.jpg', expiresAt: 'never' },
      createdAt: '2026-05-14T10:00:00.000Z',
    });

    const result = runHook([sys, u1]);
    expect(result?.imageUrl).toBe('https://signed.example.com/user.jpg');
  });
});

describe('deriveHeroCollapsed (A2 hysteresis)', () => {
  it('exposes the collapse threshold at 80dp (R23, AC9)', () => {
    expect(ARTWORK_HERO_COLLAPSE_THRESHOLD).toBe(80);
  });

  it('exposes the re-expand threshold at 40dp (R25)', () => {
    expect(ARTWORK_HERO_EXPAND_THRESHOLD).toBe(40);
  });

  it('returns false when not collapsed and scrollY < 80 (R23)', () => {
    expect(deriveHeroCollapsed(0, false)).toBe(false);
    expect(deriveHeroCollapsed(50, false)).toBe(false);
    expect(deriveHeroCollapsed(79, false)).toBe(false);
  });

  it('returns true when not collapsed and scrollY >= 80 (R24)', () => {
    expect(deriveHeroCollapsed(80, false)).toBe(true);
    expect(deriveHeroCollapsed(150, false)).toBe(true);
  });

  it('stays collapsed at scrollY < 80 once collapsed (R25 hysteresis)', () => {
    expect(deriveHeroCollapsed(50, true)).toBe(true);
    expect(deriveHeroCollapsed(40, true)).toBe(true);
  });

  it('re-expands only when scrollY < 40 (R25)', () => {
    expect(deriveHeroCollapsed(39, true)).toBe(false);
    expect(deriveHeroCollapsed(0, true)).toBe(false);
  });
});
