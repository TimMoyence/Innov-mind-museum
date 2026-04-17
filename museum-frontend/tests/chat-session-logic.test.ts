import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  sortByTime,
  mapApiMessageToUiMessage,
  buildOptimisticMessage,
  buildVisitSummary,
  bumpSuccessfulSend,
  formatLocation,
} from '../features/chat/application/chatSessionLogic.pure';
import type { ChatUiMessage, ApiMessage } from '../features/chat/application/chatSessionLogic.pure';

describe('sortByTime', () => {
  it('sorts messages by createdAt ascending', () => {
    const messages: ChatUiMessage[] = [
      { id: '3', role: 'user', text: 'third', createdAt: '2026-01-03T00:00:00Z', image: null },
      { id: '1', role: 'user', text: 'first', createdAt: '2026-01-01T00:00:00Z', image: null },
      {
        id: '2',
        role: 'assistant',
        text: 'second',
        createdAt: '2026-01-02T00:00:00Z',
        image: null,
      },
    ];

    const sorted = sortByTime(messages);

    assert.equal(sorted[0].id, '1');
    assert.equal(sorted[1].id, '2');
    assert.equal(sorted[2].id, '3');
  });

  it('does not mutate the original array', () => {
    const messages: ChatUiMessage[] = [
      { id: 'b', role: 'user', text: 'b', createdAt: '2026-01-02T00:00:00Z', image: null },
      { id: 'a', role: 'user', text: 'a', createdAt: '2026-01-01T00:00:00Z', image: null },
    ];

    const sorted = sortByTime(messages);

    assert.equal(messages[0].id, 'b', 'original array should be unchanged');
    assert.equal(sorted[0].id, 'a');
  });

  it('handles empty array', () => {
    const sorted = sortByTime([]);
    assert.deepEqual(sorted, []);
  });

  it('handles single element', () => {
    const messages: ChatUiMessage[] = [
      { id: '1', role: 'user', text: 'only', createdAt: '2026-01-01T00:00:00Z', image: null },
    ];

    const sorted = sortByTime(messages);
    assert.equal(sorted.length, 1);
    assert.equal(sorted[0].id, '1');
  });
});

describe('mapApiMessageToUiMessage', () => {
  it('maps a full API message to UI format', () => {
    const apiMsg: ApiMessage = {
      id: 'msg-1',
      role: 'assistant',
      text: 'Hello',
      createdAt: '2026-01-01T12:00:00Z',
      imageRef: 'ref-abc',
      image: { url: 'https://example.com/img.jpg', expiresAt: '2026-01-02T00:00:00Z' },
      metadata: { detectedArtwork: { title: 'Mona Lisa' } },
    };

    const uiMsg = mapApiMessageToUiMessage(apiMsg);

    assert.equal(uiMsg.id, 'msg-1');
    assert.equal(uiMsg.role, 'assistant');
    assert.equal(uiMsg.text, 'Hello');
    assert.equal(uiMsg.createdAt, '2026-01-01T12:00:00Z');
    assert.equal(uiMsg.imageRef, 'ref-abc');
    assert.deepEqual(uiMsg.image, {
      url: 'https://example.com/img.jpg',
      expiresAt: '2026-01-02T00:00:00Z',
    });
    assert.deepEqual(uiMsg.metadata, { detectedArtwork: { title: 'Mona Lisa' } });
  });

  it('defaults text to empty string when undefined', () => {
    const apiMsg: ApiMessage = {
      id: 'msg-2',
      role: 'user',
      createdAt: '2026-01-01T00:00:00Z',
    };

    const uiMsg = mapApiMessageToUiMessage(apiMsg);
    assert.equal(uiMsg.text, '');
  });

  it('defaults image and metadata to null when missing', () => {
    const apiMsg: ApiMessage = {
      id: 'msg-3',
      role: 'system',
      text: 'Welcome',
      createdAt: '2026-01-01T00:00:00Z',
    };

    const uiMsg = mapApiMessageToUiMessage(apiMsg);
    assert.equal(uiMsg.image, null);
    assert.equal(uiMsg.metadata, null);
  });
});

describe('buildOptimisticMessage', () => {
  it('builds a user message with trimmed text', () => {
    const msg = buildOptimisticMessage({ text: '  Hello world  ' });

    assert.equal(msg.role, 'user');
    assert.equal(msg.text, 'Hello world');
    assert.ok(msg.id.endsWith('-user'));
    assert.equal(msg.image, null);
  });

  it('uses default image fallback when text is empty and imageUri is provided', () => {
    const msg = buildOptimisticMessage({ text: '', imageUri: 'file:///photo.jpg' });

    assert.equal(msg.text, 'Image sent');
    assert.deepEqual(msg.image, { url: 'file:///photo.jpg', expiresAt: '' });
  });

  it('uses custom image fallback label when provided (i18n injection)', () => {
    const msg = buildOptimisticMessage({
      imageUri: 'file:///photo.jpg',
      imageFallbackLabel: 'Image envoyée',
    });
    assert.equal(msg.text, 'Image envoyée');
  });

  it('uses default audio fallback when hasAudio is true and text is empty', () => {
    const msg = buildOptimisticMessage({ hasAudio: true });

    assert.equal(msg.text, 'Voice message');
    assert.equal(msg.image, null);
  });

  it('uses custom audio fallback label when provided (i18n injection)', () => {
    const msg = buildOptimisticMessage({
      hasAudio: true,
      audioFallbackLabel: 'Message vocal',
    });
    assert.equal(msg.text, 'Message vocal');
  });

  it('prefers text over audio fallback when both provided', () => {
    const msg = buildOptimisticMessage({ text: 'transcript', hasAudio: true });

    assert.equal(msg.text, 'transcript');
  });

  it('prefers voice over image fallback when both present and no text', () => {
    const msg = buildOptimisticMessage({
      imageUri: 'file://x.jpg',
      hasAudio: true,
    });

    assert.equal(msg.text, 'Voice message');
  });

  it('uses empty string when no text, no image, no audio', () => {
    const msg = buildOptimisticMessage({});

    assert.equal(msg.text, '');
  });

  it('uses a custom id when provided (e.g. offline queued id)', () => {
    const msg = buildOptimisticMessage({ text: 'hi', id: 'queued-42' });

    assert.equal(msg.id, 'queued-42');
  });

  it('defaults to a timestamped id ending with -user', () => {
    const msg = buildOptimisticMessage({ text: 'hi' });

    assert.ok(msg.id.endsWith('-user'));
  });

  it('sets createdAt to a valid ISO date string', () => {
    const before = new Date().toISOString();
    const msg = buildOptimisticMessage({ text: 'test' });
    const after = new Date().toISOString();

    assert.ok(msg.createdAt >= before);
    assert.ok(msg.createdAt <= after);
  });

  it('preserves sendFailed as undefined (not set) on optimistic message', () => {
    const msg = buildOptimisticMessage({ text: 'hello' });

    assert.equal(msg.sendFailed, undefined);
  });

  it('returns image fallback when whitespace-only text is provided with imageUri', () => {
    const msg = buildOptimisticMessage({ text: '   ', imageUri: 'file://x.jpg' });

    assert.equal(msg.text, 'Image sent');
  });
});

describe('bumpSuccessfulSend', () => {
  it('increments the ref counter', () => {
    const ref = { current: 0 };
    bumpSuccessfulSend(ref);
    assert.equal(ref.current, 1);
  });

  it('returns true exactly on threshold crossing (default 3)', () => {
    const ref = { current: 0 };
    assert.equal(bumpSuccessfulSend(ref), false);
    assert.equal(bumpSuccessfulSend(ref), false);
    assert.equal(bumpSuccessfulSend(ref), true);
    assert.equal(bumpSuccessfulSend(ref), false);
  });

  it('respects a custom threshold', () => {
    const ref = { current: 0 };
    assert.equal(bumpSuccessfulSend(ref, 1), true);
    assert.equal(bumpSuccessfulSend(ref, 1), false);
  });
});

describe('formatLocation', () => {
  it('returns undefined when latitude is null', () => {
    assert.equal(formatLocation(null, 2.3), undefined);
  });

  it('returns undefined when longitude is null', () => {
    assert.equal(formatLocation(48.8, null), undefined);
  });

  it('returns undefined when both are undefined', () => {
    assert.equal(formatLocation(undefined, undefined), undefined);
  });

  it('formats "lat:LAT,lng:LNG" when both coordinates present', () => {
    assert.equal(formatLocation(48.8566, 2.3522), 'lat:48.8566,lng:2.3522');
  });

  it('accepts zero coordinates (equator / prime meridian)', () => {
    assert.equal(formatLocation(0, 0), 'lat:0,lng:0');
  });
});

describe('buildVisitSummary', () => {
  it('returns empty summary for empty messages', () => {
    const summary = buildVisitSummary([], null);

    assert.equal(summary.artworks.length, 0);
    assert.equal(summary.roomsVisited.length, 0);
    assert.equal(summary.messageCount, 0);
    assert.equal(summary.expertiseLevel, null);
    assert.equal(summary.museumName, null);
  });

  it('uses sessionTitle as museumName fallback when no museum in metadata', () => {
    const messages: ChatUiMessage[] = [
      { id: '1', role: 'user', text: 'hello', createdAt: '2026-01-01T10:00:00Z', image: null },
    ];

    const summary = buildVisitSummary(messages, 'Louvre Visit');

    assert.equal(summary.museumName, 'Louvre Visit');
  });

  it('extracts artworks from assistant messages with detectedArtwork', () => {
    const messages: ChatUiMessage[] = [
      {
        id: '1',
        role: 'user',
        text: 'what is this?',
        createdAt: '2026-01-01T10:00:00Z',
        image: null,
      },
      {
        id: '2',
        role: 'assistant',
        text: 'This is the Mona Lisa.',
        createdAt: '2026-01-01T10:01:00Z',
        image: null,
        metadata: {
          detectedArtwork: {
            title: 'Mona Lisa',
            artist: 'Leonardo da Vinci',
            room: 'Room 711',
            museum: 'Louvre',
          },
        },
      },
    ];

    const summary = buildVisitSummary(messages, null);

    assert.equal(summary.artworks.length, 1);
    assert.equal(summary.artworks[0].title, 'Mona Lisa');
    assert.equal(summary.artworks[0].artist, 'Leonardo da Vinci');
    assert.equal(summary.artworks[0].room, 'Room 711');
    assert.equal(summary.museumName, 'Louvre');
  });

  it('deduplicates artworks with the same title', () => {
    const messages: ChatUiMessage[] = [
      {
        id: '1',
        role: 'assistant',
        text: 'First mention',
        createdAt: '2026-01-01T10:00:00Z',
        image: null,
        metadata: { detectedArtwork: { title: 'Starry Night', artist: 'Van Gogh' } },
      },
      {
        id: '2',
        role: 'assistant',
        text: 'Second mention',
        createdAt: '2026-01-01T10:05:00Z',
        image: null,
        metadata: { detectedArtwork: { title: 'Starry Night', artist: 'Van Gogh' } },
      },
    ];

    const summary = buildVisitSummary(messages, null);

    assert.equal(summary.artworks.length, 1);
    assert.equal(summary.artworks[0].title, 'Starry Night');
  });

  it('extracts imageUrl from enriched images', () => {
    const messages: ChatUiMessage[] = [
      {
        id: '1',
        role: 'assistant',
        text: 'A painting.',
        createdAt: '2026-01-01T10:00:00Z',
        image: null,
        metadata: {
          detectedArtwork: { title: 'Water Lilies', artist: 'Monet' },
          images: [
            {
              url: 'https://img.example.com/full.jpg',
              thumbnailUrl: 'https://img.example.com/thumb.jpg',
              caption: 'Water Lilies',
              source: 'wikidata' as const,
              score: 0.9,
            },
          ],
        },
      },
    ];

    const summary = buildVisitSummary(messages, null);

    assert.equal(summary.artworks[0].imageUrl, 'https://img.example.com/thumb.jpg');
  });

  it('falls back to url when thumbnailUrl is missing from enriched images', () => {
    const messages: ChatUiMessage[] = [
      {
        id: '1',
        role: 'assistant',
        text: 'A painting.',
        createdAt: '2026-01-01T10:00:00Z',
        image: null,
        metadata: {
          detectedArtwork: { title: 'Impression Sunrise', artist: 'Monet' },
          images: [
            // Simulate runtime data where thumbnailUrl is undefined (e.g. older API response)
            {
              url: 'https://img.example.com/full.jpg',
              caption: 'Sunrise',
              source: 'unsplash' as const,
              score: 0.8,
            } as any,
          ],
        },
      },
    ];

    const summary = buildVisitSummary(messages, null);

    // thumbnailUrl is undefined so ?? falls back to url
    assert.equal(summary.artworks[0].imageUrl, 'https://img.example.com/full.jpg');
  });

  it('calculates duration correctly', () => {
    const messages: ChatUiMessage[] = [
      { id: '1', role: 'user', text: 'start', createdAt: '2026-01-01T10:00:00Z', image: null },
      { id: '2', role: 'assistant', text: 'reply', createdAt: '2026-01-01T10:30:00Z', image: null },
      { id: '3', role: 'user', text: 'end', createdAt: '2026-01-01T11:00:00Z', image: null },
    ];

    const summary = buildVisitSummary(messages, null);

    assert.equal(summary.duration.startedAt, '2026-01-01T10:00:00Z');
    assert.equal(summary.duration.endedAt, '2026-01-01T11:00:00Z');
    assert.equal(summary.duration.minutes, 60);
    assert.equal(summary.messageCount, 3);
  });

  it('collects unique rooms visited', () => {
    const messages: ChatUiMessage[] = [
      {
        id: '1',
        role: 'assistant',
        text: 'In Room A.',
        createdAt: '2026-01-01T10:00:00Z',
        image: null,
        metadata: { detectedArtwork: { title: 'Art 1', room: 'Room A' } },
      },
      {
        id: '2',
        role: 'assistant',
        text: 'In Room B.',
        createdAt: '2026-01-01T10:05:00Z',
        image: null,
        metadata: { detectedArtwork: { title: 'Art 2', room: 'Room B' } },
      },
      {
        id: '3',
        role: 'assistant',
        text: 'Back in Room A.',
        createdAt: '2026-01-01T10:10:00Z',
        image: null,
        metadata: { detectedArtwork: { title: 'Art 3', room: 'Room A' } },
      },
    ];

    const summary = buildVisitSummary(messages, null);

    assert.equal(summary.roomsVisited.length, 2);
    assert.ok(summary.roomsVisited.includes('Room A'));
    assert.ok(summary.roomsVisited.includes('Room B'));
  });

  it('tracks last expertise signal', () => {
    const messages: ChatUiMessage[] = [
      {
        id: '1',
        role: 'assistant',
        text: 'Basic info.',
        createdAt: '2026-01-01T10:00:00Z',
        image: null,
        metadata: { expertiseSignal: 'beginner' },
      },
      {
        id: '2',
        role: 'assistant',
        text: 'Advanced info.',
        createdAt: '2026-01-01T10:05:00Z',
        image: null,
        metadata: { expertiseSignal: 'expert' },
      },
    ];

    const summary = buildVisitSummary(messages, null);

    assert.equal(summary.expertiseLevel, 'expert');
  });

  it('ignores user messages when extracting metadata', () => {
    const messages: ChatUiMessage[] = [
      {
        id: '1',
        role: 'user',
        text: 'question',
        createdAt: '2026-01-01T10:00:00Z',
        image: null,
        metadata: { detectedArtwork: { title: 'Should be ignored' } },
      },
      {
        id: '2',
        role: 'assistant',
        text: 'answer',
        createdAt: '2026-01-01T10:01:00Z',
        image: null,
        metadata: { detectedArtwork: { title: 'Actual Art' } },
      },
    ];

    const summary = buildVisitSummary(messages, null);

    assert.equal(summary.artworks.length, 1);
    assert.equal(summary.artworks[0].title, 'Actual Art');
  });

  it('skips assistant messages without metadata', () => {
    const messages: ChatUiMessage[] = [
      {
        id: '1',
        role: 'assistant',
        text: 'generic reply',
        createdAt: '2026-01-01T10:00:00Z',
        image: null,
      },
      {
        id: '2',
        role: 'assistant',
        text: 'specific reply',
        createdAt: '2026-01-01T10:01:00Z',
        image: null,
        metadata: { detectedArtwork: { title: 'The Thinker', artist: 'Rodin' } },
      },
    ];

    const summary = buildVisitSummary(messages, null);

    assert.equal(summary.artworks.length, 1);
    assert.equal(summary.artworks[0].title, 'The Thinker');
  });

  it('uses first museum name found when multiple are present', () => {
    const messages: ChatUiMessage[] = [
      {
        id: '1',
        role: 'assistant',
        text: 'first',
        createdAt: '2026-01-01T10:00:00Z',
        image: null,
        metadata: { detectedArtwork: { title: 'Art A', museum: 'Louvre' } },
      },
      {
        id: '2',
        role: 'assistant',
        text: 'second',
        createdAt: '2026-01-01T10:05:00Z',
        image: null,
        metadata: { detectedArtwork: { title: 'Art B', museum: 'Orsay' } },
      },
    ];

    const summary = buildVisitSummary(messages, 'Default Title');

    assert.equal(summary.museumName, 'Louvre');
  });
});
